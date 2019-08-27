import {AbstractBatch, AbstractIterator, AbstractIteratorOptions} from 'abstract-leveldown';
import {Quiz, QuizGraph, QuizKind, textToGraph} from 'curtiz-parse-markdown';
import {KeyToEbisu, whichToQuiz} from 'curtiz-quiz-planner'
import {flatMapIterator, groupBy, kata2hira, mapRight, partitionBy} from 'curtiz-utils';
import * as web from 'curtiz-web-db';
import {Gatty, setup, sync} from 'isomorphic-gatty';
import {Furigana, furiganaToString, stringToFurigana} from 'jmdict-furigana-node';
import leveljs from 'level-js';
import {LevelUp} from 'levelup';
import React, {useEffect, useMemo, useReducer, useRef, useState} from 'react';
import ReactDOM from 'react-dom';

import {Doc, DOCS_PREFIX, EventDoc, loadDocs, saveDoc} from './docs';
import {Edit} from './Edit';

const ce = React.createElement;
type Db = LevelUp<leveljs, AbstractIterator<any, any>>;
type GraphType = QuizGraph&KeyToEbisu;

function FuriganaComponent(props: {furigana?: Furigana[], furiganaString?: string}) {
  const arr = [];
  for (const f of (props.furigana || stringToFurigana(props.furiganaString || ''))) {
    arr.push(typeof f === 'string' ? f : ce('ruby', null, f.ruby, ce('rt', null, f.rt)));
  }
  return ce('span', {}, ...arr);
}

function blockToUnlearnedKeys(block: string[], graph: GraphType): Map<number, Set<string>> {
  const raws = block.map((line, lino) => block[0] + (lino ? '\n' + line : ''));
  return new Map(raws.map((raw, idx) => {
    const keys = Array.from(graph.raws.get(raw) || []).filter(key => !graph.ebisus.has(key));
    return [idx, new Set(keys)];
  }));
}
const subkind2type = {
  passive: 'basic',
  seePrompt: 'kread',
  seeResponses: 'kwrite',
  regular: 'basic',
  noHint: 'basic',
  promptHint: 'kread',
  responsesHint: 'kwrite',
} as const ;
const subtypes = new Set(Object.values(subkind2type));
function Block(
    props: {block: string[], graph: GraphType, learn: (keys: string[]) => any, unlearn: (keys: string[]) => any}) {
  const raw = props.block.map((line, lino) => props.block[0] + (lino ? '\n' + line : ''));
  const [unlearned, setUnlearned] = useState(() => blockToUnlearnedKeys(props.block, props.graph));
  return ce(
      'ul',
      null,
      props.block.map((line, i) => {
        const keys = Array.from(props.graph.raws.get(raw[i]) || []); // FIXME repeating work? cf. `unlearned`
        const unlearnedKeys = keys.filter(key => !props.graph.ebisus.has(key));
        const numLearned = keys.length - unlearnedKeys.length;
        const typeToKeys = groupBy(unlearnedKeys, key => {
          const hit = props.graph.nodes.get(key);
          return hit ? ('subkind' in hit ? subkind2type[hit.subkind] : 'basic') : 'basic';
        });
        const buttons = Array.from(
            subtypes,
            type => {
              const learnedKeys = typeToKeys.get(type) || [];
              return ce(
                  'button',
                  {
                    disabled: learnedKeys.length === 0,
                    onClick: () => {
                      const next = new Map(unlearned);
                      const oldKeys = next.get(i);
                      if (oldKeys && learnedKeys) {
                        learnedKeys.forEach(k => oldKeys.delete(k));
                        setUnlearned(next);
                        props.learn(learnedKeys);
                      }
                    }
                  },
                  `Learn ${learnedKeys.length} ${type}s`,
              );
            },
        );
        if (numLearned > 0) {
          const n = keys.length - unlearnedKeys.length;
          const plural = 'card' + (n > 1 ? 's' : '');
          const unlearn = ce(
              'button',
              {
                disabled: false,
                onClick: () => {
                  props.unlearn(keys);
                  const next = new Map(unlearned);
                  next.set(i, new Set(keys));
                  setUnlearned(next);
                }
              },
              `Unlearn ${n} ${plural}`,
          );
          buttons.push(unlearn);
        }
        return ce(
            'li',
            {key: i},
            line.includes('@furigana') ? FuriganaComponent({furigana: stringToFurigana(line)}) : line,
            ...(!props.graph.raws.has(raw[i]) ? [''] : buttons),
        );
      }),
  )
}

function Learn(props: {graph: GraphType, doc:Doc, learn: (keys: string[]) => any, unlearn: (keys: string[]) => any}) {
  const blocks = markdownToBlocks(props.doc.content);
  return ce('div', null, blocks.map((block, i) => ce(Block, {...props, key: props.doc.title + '/' + i, block})));
  // Without `key` above, React doesn't properly handle the reducer.
}

function wrap(s: string) { return `_(${s})_` }
function crossMatch(long: string[], short: string[]): boolean {
  return long.length >= short.length ? long.some(a => short.includes(a)) : crossMatch(short, long);
}
const shuf: (v: any[]) => any[] = require('array-shuffle');
function toTranslationString(quiz: Quiz) { return quiz.translation ? Object.values(quiz.translation).join(' / ') : ''; }
function AQuiz(props: {quiz: Quiz, update: (result: boolean, key: string, summary: string) => any}) {
  const quiz = props.quiz;
  type GraderType = (s: string) => boolean;
  const {grader, prompt, passive} = useMemo(() => {
    let grader: GraderType;
    let prompt = '';
    let passive = false;

    if (quiz.kind === QuizKind.Cloze) {
      let promptIdx = 0;
      prompt =
          quiz.contexts
              .map(context => context === null ? (quiz.prompts && wrap(quiz.prompts[promptIdx++]) || '___') : context)
              .join('') +
          ' ' + toTranslationString(quiz);
      grader = (s: string) => crossMatch(quiz.clozes[0], [s, kata2hira(s)]);
    } else if (quiz.kind === QuizKind.Card) {
      if (quiz.subkind === 'passive') {
        prompt = (quiz.lede ? furiganaToString(quiz.lede) : quiz.prompt);
        if (quiz.translation) { prompt += ` (${toTranslationString(quiz)})`; }
        grader = () => true;
        passive = true;
      } else {
        prompt = quiz.prompt;
        grader = (s: string) => crossMatch(quiz.responses.concat(quiz.prompt), [s, kata2hira(s)]);
      }
    } else if (quiz.kind === QuizKind.Match) {
      const idxs: number[] = shuf(Array.from(Array(quiz.pairs.length), (_, n) => n));
      const texts = quiz.pairs.map((o, i) => `(${i + 1})` + furiganaToString(o.text));
      const tls = quiz.pairs.map(o => o.translation['en']);
      const shuffledTls = idxs.map(i => tls[i] + '=?');
      prompt = `Match ${texts.join('。 ')}。 Choices: ・${shuffledTls.join(' ・')}`;
      grader = (s: string) => s === idxs.map(n => n + 1).join('');
    } else {
      throw new Error('unknown quiz type');
    }
    return {grader, prompt, passive};
  }, [quiz.uniqueId]);

  const [input, setInput] = useState('');
  const {focus, ref} = useFocus();
  return ce(
      'div',
      null,
      FuriganaComponent({furiganaString: prompt}),
      ce(
          'form',
          {
            onSubmit: (e: any) => {
              e.preventDefault();
              const grade = grader(input);
              const summary = (grade ? '🙆‍♂️🙆‍♀️! ' : '🙅‍♀️🙅‍♂️. ') +
                              (passive ? '' : `「${input}」for `) + `${prompt}` +
                              (quiz.lede ? ` ・ ${furiganaToString(quiz.lede)}` : '') + toTranslationString(quiz) +
                              ` @ ${(new Date()).toISOString()}`;
              props.update(grade, quiz.uniqueId, summary);
              setInput('');
              focus();
            },
          },
          passive ? '' : ce('input', {
            value: input,
            type: 'text',
            name: 'name',
            onChange: e => setInput(e.target.value),
            autoFocus: true,
            ref
          }),
          ce('button', {disabled: passive ? false : !input, type: 'submit'}, 'Submit'),
          ce('button', {
            onClick: (e: any) => {
              e.preventDefault();
              const summary = `🤷‍♂️🤷‍♀️ ${prompt} ・ ${
                  (quiz.lede && furiganaToString(quiz.lede) || '')} ${toTranslationString(quiz)}`;
              props.update(false, quiz.uniqueId, summary);
              setInput('');
              focus();
            }
          },
             'I give up'),
          ),
  );
}
function useFocus() {
  // Via https://stackoverflow.com/a/54159564/500207
  const ref = useRef(null);
  const focus = () => { ref.current && (ref.current as any).focus() };
  return {focus, ref};
};

function Quizzer(props: {graph: GraphType, update: (result: boolean, key: string) => any}) {
  const [quiz, setQuiz] = useState(undefined as Quiz | undefined);
  if (quiz === undefined) {
    // const details = {} as any;
    // const bestQuiz = whichToQuiz(props.graph, {details});
    const bestQuiz = whichToQuiz(props.graph);
    if (bestQuiz !== quiz) { setQuiz(bestQuiz); }
    // console.log('recalculating', details);
  }
  // console.log('rerunning')
  const [pastResults, setPastResults] = useState([] as string[]);

  if (!quiz) { return ce('p', null, 'Nothing to quiz for this document!'); }
  return ce('div', null, ce(AQuiz, {
              update: (result: boolean, key: string, summary: string) => {
                props.update(result, key);
                setQuiz(undefined); // invalidate
                setPastResults(pastResults.concat(summary));
              },
              quiz
            }),
            ce('ul', null, mapRight(pastResults, s => ce('li', {key: s}, FuriganaComponent({furiganaString: s})))));
}

type AppState = 'edit'|'learn'|'quiz'|'login';
type CurtizEvent = web.EventLearn|web.EventUnlearn|web.EventUpdate|EventDoc;
function Main() {
  const [db, setDb] = useState(undefined as Db | undefined);
  const defaultGraph: GraphType|undefined = undefined;
  const [graph, setGraph] = useState(defaultGraph as GraphType | undefined);
  const [docs, setDocs] = useState([] as Doc[]);
  const [gatty, setGatty] = useState(undefined as Gatty | undefined)
  const [lastSharedUid, setLastSharedUid] = useState('' as string);

  async function syncer() {
    if (gatty && db) {
      const opts:
          AbstractIteratorOptions<string> = {gt: web.EVENT_PREFIX + lastSharedUid, lt: web.EVENT_PREFIX + '\ufe0f'};
      const res = await web.summarizeDb(db, opts);
      const {newEvents, newSharedUid} = await sync(gatty, lastSharedUid, res.map(o => o.key), res.map(o => o.value));
      if (newSharedUid !== lastSharedUid) {
        const events: CurtizEvent[] = newEvents.map(s => JSON.parse(s));
        const batch: AbstractBatch[] = [{type: 'put', key: 'lastSharedUid', value: newSharedUid}];
        {
          const dbKeyToBatch: Map<string, AbstractBatch> = new Map([]);
          for (const e of events) {
            // event should be committed to local db as is
            batch.push({type: 'put', key: e.uid, value: e});
            // local db should update the things the events talk about too!
            if (e.action === 'learn' || e.action === 'update') {
              const key = web.EBISU_PREFIX + e.key;
              dbKeyToBatch.set(key, {type: 'put', key, value: e.ebisu});
            } else if (e.action === 'doc') {
              const key = DOCS_PREFIX + e.doc.title;
              dbKeyToBatch.set(key, {type: 'put', key, value: e.doc});
            } else if (e.action === 'unlearn') {
              const key = web.EBISU_PREFIX + e.key;
              dbKeyToBatch.set(key, {type: 'del', key});
            } else {
              throw new Error('unhandled event action');
            }
          }
          for (const value of dbKeyToBatch.values()) { batch.push(value); }
        }
        await db.batch(batch);
        setLastSharedUid(newSharedUid);
      }
    }
  }

  async function loader() {
    const newdb = db || web.setup('testing');
    if (db !== newdb) { setDb(newdb); }

    if (newdb) {
      const foo = await web.summarizeDb(newdb) as {key: string, value: any}[];
      console.log(foo);

      try {
        const fromDb = await newdb.get('lastSharedUid');
        if (lastSharedUid !== fromDb) { setLastSharedUid(fromDb); }
      } catch (e) { await newdb.put('lastSharedUid', lastSharedUid); }
    }

    const docs = await loadDocs(newdb, DOCS_PREFIX);
    { // add new empty doc for editing
      const date = new Date();
      const newName = 'New ' + date.toISOString();
      docs.push({title: newName, content: '(empty)', source: undefined, modified: date});
    }
    setDocs(docs);

    let graph: GraphType|undefined = undefined;
    for (const doc of docs) {
      try {
        if (!graph) {
          graph = await web.initialize(newdb, doc.content);
        } else {
          textToGraph(doc.content, graph);
        }
      } catch (e) {
        alert('Error caught. See JS Console');
        console.error('Error analyzing text. Skipping', e);
      }
    }
    if (graph) { setGraph(graph); }
  }
  useEffect(() => { loader(); }, [0]);

  async function updateDoc(doc: Doc) {
    if (!db) { throw new Error('cannot update doc when db undefined'); }
    saveDoc(db, DOCS_PREFIX, web.EVENT_PREFIX, doc);
    try {
      textToGraph(doc.content, graph);
      setGraph(graph);
    } catch (e) {
      alert('Error caught. See JS Console');
      console.error('Error analyzing text. Skipping', e);
    }
  }

  const defaultState: AppState = 'edit';
  const [state, setState] = useState(defaultState as AppState);

  const [selectedTitle, setSelectedTitle] = useState(undefined as string | undefined);
  const titles = Array.from(docs.map(doc => doc.title));
  if (selectedTitle === undefined && titles[0] !== undefined) { setSelectedTitle(titles[0]) }
  const listOfDocs = ce(
      'ul', null,
      titles.map(title => ce('li', {key: title}, title,
                             ce('button', {disabled: title === selectedTitle, onClick: () => setSelectedTitle(title)},
                                'select'))));

  const [updateTrigger, setUpdateTrigger] = useState(0);
  // const graph = graph.get(selectedTitle || '');
  const learn = graph ? ce(Learn, {
    graph,
    doc:docs.filter(doc=>doc.title===selectedTitle)[0],
    learn: (keys: string[]) => db ? web.learnQuizzes(db, keys, graph) : 0,
    unlearn: (keys: string[]) => db ? web.unlearnQuizzes(db, keys, graph) : 0,
  })
                      : '';
  const quiz = (graph) ? ce(Quizzer, {
    key: selectedTitle,
    graph,
    updateTrigger,
    update: (result: boolean, key: string) => web.updateQuiz(db as Db, result, key, graph)
  })
                       : '';
  const login = ce(Login, {
    tellparent: async (url, username, token) => {
      const newgatty = gatty || await setup({corsProxy: 'https://cors.isomorphic-git.org', username, token}, url);
      if (gatty !== newgatty) { setGatty(newgatty); }
    }
  });
  const body =
      state === 'edit' ? ce(Edit, {docs, updateDoc}) : state === 'quiz' ? quiz : state === 'learn' ? learn : login;

  const setStateDebounce = (x: AppState) => {
    if (x !== state) {
      setState(x);
      setUpdateTrigger(updateTrigger + 1);
    }
  };
  return ce(
      'div',
      null,
      ce('button', {onClick: () => setStateDebounce('edit')}, 'Edit'),
      ce('button', {onClick: () => setStateDebounce('learn')}, 'Learn'),
      ce('button', {onClick: () => setStateDebounce('quiz')}, 'Quiz'),
      ce('button', {onClick: () => setStateDebounce('login')}, 'Login'),
      ce('div', null, listOfDocs, body),
  );
}

function Login(props: {tellparent: (a: string, b: string, c: string) => void}) {
  const [url, setURL] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  return ce(
      'div',
      null,
      ce(
          'form',
          {
            onSubmit: (e: any) => {
              e.preventDefault();
              props.tellparent(url, username, token);
            }
          },
          ce(
              'div',
              {className: 'input-group'},
              ce('label', null, 'URL'),
              ce('input', {
                type: 'text',
                autoCapitalize: 'none',
                autoCorrect: 'off',
                value: url,
                onChange: e => setURL(e.target.value)
              }),
              ),
          ce(
              'div',
              {className: 'input-group'},
              ce('label', null, 'Username'),
              ce('input', {
                type: 'text',
                autoCapitalize: 'none',
                autoCorrect: 'off',
                value: username,
                onChange: e => setUsername(e.target.value)
              }),
              ),
          ce(
              'div',
              {className: 'input-group'},
              ce('label', null, 'Token'),
              ce('input', {type: 'password', value: token, onChange: e => setToken(e.target.value)}),
              ),
          ce('input', {type: 'submit', value: 'Login'}),
          ),
  );
}

ReactDOM.render(ce(Main), document.getElementById('root'));

function markdownToBlocks(md: string) {
  const re = /^#+\s+.+$/;
  const headers = partitionBy(md.split('\n'), s => re.test(s));
  return headers;
}
