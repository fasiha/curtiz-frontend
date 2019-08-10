import {AbstractIterator} from 'abstract-leveldown';
import {Quiz, QuizGraph, QuizKind, textToGraph} from 'curtiz-parse-markdown';
import {KeyToEbisu, whichToQuiz} from 'curtiz-quiz-planner'
import {flatMapIterator, groupBy, kata2hira, mapRight, partitionBy} from 'curtiz-utils';
import * as web from 'curtiz-web-db';
import {Furigana, furiganaToString, stringToFurigana} from 'jmdict-furigana-node';
import leveljs from 'level-js';
import {LevelUp} from 'levelup';
import React, {useEffect, useMemo, useReducer, useRef, useState} from 'react';
import ReactDOM from 'react-dom';

import {Doc, DOCS_PREFIX, loadDocs, saveDoc} from './docs';
import {Edit} from './Edit';

const ce = React.createElement;
type Db = LevelUp<leveljs, AbstractIterator<any, any>>;
type GraphType = QuizGraph&KeyToEbisu&{doc: Doc};

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
};
const subtypes = new Set(Object.values(subkind2type));
function Block(props: {block: string[], graph: GraphType, learn: (keys: string[], graph: GraphType) => any}) {
  const raw = props.block.map((line, lino) => props.block[0] + (lino ? '\n' + line : ''));
  const [unlearned, setUnlearned] = useState(() => blockToUnlearnedKeys(props.block, props.graph));
  return ce(
      'ul',
      null,
      props.block.map((line, i) => {
        const keys = Array.from(props.graph.raws.get(raw[i]) || []); // FIXME repeating work? cf. `unlearned`
        const unlearnedKeys = keys.filter(key => !props.graph.ebisus.has(key));
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
                        props.learn(learnedKeys, props.graph);
                      }
                    }
                  },
                  `Learn ${learnedKeys.length} ${type}s`,
              );
            },
        );
        return ce(
            'li',
            {key: i},
            line.includes('@furigana') ? FuriganaComponent({furigana: stringToFurigana(line)}) : line,
            ...(!props.graph.raws.has(raw[i]) ? [''] : buttons),
        );
      }),
  )
}

function Learn(props: {graph: GraphType, learn: (keys: string[]) => any}) {
  const blocks = markdownToBlocks(props.graph.doc.content);
  return ce(
      'div', null,
      blocks.map((block, i) =>
                     ce(Block, {key: props.graph.doc.title + '/' + i, block, graph: props.graph, learn: props.learn})));
  // Without `key` above, React doesn't properly handle the reducer.
}

function wrap(s: string) { return `_(${s})_` }
function crossMatch(long: string[], short: string[]): boolean {
  return long.length >= short.length ? long.some(a => short.includes(a)) : crossMatch(short, long);
}
const shuf: (v: any[]) => any[] = require('array-shuffle');

function AQuiz(props: {quiz: Quiz, update: (result: boolean, key: string, summary: string) => any}) {
  const quiz = props.quiz;
  type GraderType = (s: string) => boolean;
  const {grader, prompt} = useMemo(() => {
    let grader: GraderType;
    let prompt = '';
    if (quiz.kind === QuizKind.Cloze) {
      let promptIdx = 0;
      prompt = (quiz.contexts.map(
                    context => context === null ? (quiz.prompts && wrap(quiz.prompts[promptIdx++]) || '___') : context))
                   .join('');
      if (quiz.translation && quiz.translation.en) { prompt += ` (${quiz.translation.en})`; }
      grader = (s: string) => crossMatch(quiz.clozes[0], [s, kata2hira(s)]);
    } else if (quiz.kind === QuizKind.Card) {
      prompt = quiz.prompt + ((quiz.translation && quiz.translation.en) ? ` (${quiz.translation.en})` : '');
      grader = (s: string) => crossMatch(quiz.responses.concat(quiz.prompt), [s, kata2hira(s)]);
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
    return {grader, prompt};
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
                              `「${input}」for ${prompt}` + (quiz.lede ? ` ・ ${furiganaToString(quiz.lede)}` : '') +
                              ` @ ${(new Date()).toISOString()}`;
              props.update(grade, quiz.uniqueId, summary);
              setInput('');
              focus();
            },
          },
          ce('input',
             {value: input, type: 'text', name: 'name', onChange: e => setInput(e.target.value), autoFocus: true, ref}),
          ce('button', {
            disabled: !input.length,
            type: 'submit',
          },
             'Submit'),
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

type AppState = 'edit'|'learn'|'quiz';
type GraphsMap = Map<string, GraphType>;

function Main() {
  const [db, setDb] = useState(undefined as Db | undefined);
  const defaultGraphsMap: GraphsMap = new Map();
  const [graphsMap, setGraphsMap] = useState(defaultGraphsMap);

  async function loader() {
    const newdb = db || web.setup('testing');
    setDb(newdb);

    const docs = await loadDocs(newdb, DOCS_PREFIX);
    { // add new empty doc for editing
      const date = new Date();
      const newName = 'New ' + date.toISOString();
      docs.push({title: newName, content: '(empty)', source: undefined, modified: date});
    }
    const graphs: GraphsMap = new Map();
    for (const doc of docs) {
      try {
        graphs.set(doc.title, {...await web.initialize(newdb, doc.content), doc});
      } catch (e) {
        alert('Error caught. See JS Console');
        console.error('Error analyzing text. Skipping', e);
      }
    }
    setGraphsMap(graphs);
  }
  useEffect(() => { loader(); }, [0]);

  async function updateDoc(doc: Doc) {
    if (!db) { throw new Error('cannot update doc when db undefined'); }
    saveDoc(db, DOCS_PREFIX, web.EVENT_PREFIX, doc);
    try {
      graphsMap.set(doc.title, {...await web.initialize(db, doc.content), doc});
    } catch (e) {
      alert('Error caught. See JS Console');
      console.error('Error analyzing text. Skipping', e);
    }
  }

  const defaultState: AppState = 'edit';
  const [state, setState] = useState(defaultState as AppState);

  const [selectedTitle, setSelectedTitle] = useState(undefined as string | undefined);
  const titles = Array.from(graphsMap.keys());
  if (selectedTitle === undefined && titles[0] !== undefined) { setSelectedTitle(titles[0]) }
  const listOfDocs = ce(
      'ul', null,
      titles.map(title => ce('li', {key: title}, title,
                             ce('button', {disabled: title === selectedTitle, onClick: () => setSelectedTitle(title)},
                                'select'))));

  const [updateTrigger, setUpdateTrigger] = useState(0);
  const graph = graphsMap.get(selectedTitle || '');
  const learn = graph ? ce(Learn, {graph, learn: (keys: string[]) => db ? web.learnQuizzes(db, keys, graph) : 0}) : '';
  const quiz = (graph) ? ce(Quizzer, {
    key: selectedTitle,
    graph,
    updateTrigger,
    update: (result: boolean, key: string) => web.updateQuiz(db as Db, result, key, graph)
  })
                       : '';
  const body = state === 'edit' ? ce(Edit, {docs: Array.from(graphsMap.values(), graph => graph.doc), updateDoc})
                                : state === 'quiz' ? quiz : learn;

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
      ce('div', null, listOfDocs, body),
  );
}

ReactDOM.render(ce(Main), document.getElementById('root'));

function markdownToBlocks(md: string) {
  const re = /^#+\s+.+$/;
  const headers = partitionBy(md.split('\n'), s => re.test(s));
  return headers;
}
