import {AbstractIterator} from 'abstract-leveldown';
import {Quiz, QuizGraph} from 'curtiz-parse-markdown';
import {KeyToEbisu, whichToQuiz} from 'curtiz-quiz-planner'
import {kata2hira, mapRight, partitionBy} from 'curtiz-utils';
import * as web from 'curtiz-web-db';
import leveljs from 'level-js';
import {LevelUp} from 'levelup';
import React, {useEffect, useReducer, useState} from 'react';
import ReactDOM from 'react-dom';

import {Doc, Docs, DOCS_PREFIX, loadDocs, saveDoc} from './docs';
import {Edit} from './Edit';

const ce = React.createElement;
type Db = LevelUp<leveljs, AbstractIterator<any, any>>;
type GraphType = QuizGraph&KeyToEbisu;

type BlockState = {
  learned: (boolean|undefined)[],
};
type BlockAction = {
  type: 'learn',
  payload: number,
  learn: () => any,
};

function blockReducer(state: BlockState, action: BlockAction): BlockState {
  if (action.type === 'learn') {
    state.learned[action.payload] = true;
    action.learn();
    return {...state};
  } else {
    throw new Error('unknown action');
  }
}

function Block(props: {block: string[], graph: GraphType, learn: (keys: string[], graph: GraphType) => any}) {
  const raw = props.block.map((line, lino) => props.block[0] + (lino ? '\n' + line : ''));
  const learned = (x: string) => isRawLearned(x, props.graph);
  const learnable = (x: string) => isRawLearnable(x, props.graph);
  const init: BlockState = {learned: raw.map(r => learnable(r) ? learned(r) : undefined)};
  const [state, dispatch] = useReducer(blockReducer, init);
  return ce(
      'ul',
      null,
      props.block.map((line, i) => ce(
                          'li',
                          {key: i},
                          line,
                          state.learned[i] === undefined
                              ? ''
                              : (state.learned[i] ? ' [learned!] '
                                                  : ce('button', {
                                                      onClick: () => dispatch({
                                                        type: 'learn',
                                                        payload: i,
                                                        learn: () => props.learn(
                                                            Array.from(props.graph.raws.get(raw[i]) || []), props.graph)
                                                      })
                                                    },
                                                       'Learn')),
                          )),
  )
}

function Learn(props: {doc: Doc, graph: GraphType, learn: (keys: string[]) => any}) {
  const blocks = markdownToBlocks(props.doc.content);
  return ce('div', null,
            blocks.map((block, i) =>
                           ce(Block, {key: props.doc.title + '/' + i, block, graph: props.graph, learn: props.learn})));
  // Without `key` above, React doesn't properly handle the reducer.
}

function wrap(s: string) { return `_(${s})_` }
function crossMatch(long: string[], short: string[]): boolean {
  return long.length >= short.length ? long.some(a => short.includes(a)) : crossMatch(short, long);
}
function AQuiz(props: {quiz: Quiz, update: (result: boolean, key: string, summary: string) => any}) {
  const quiz = props.quiz;
  let grader: (s: string) => boolean;
  let prompt = '';
  if (quiz.kind === 'cloze') {
    let promptIdx = 0;
    prompt = (quiz.contexts.map(context => context === null ? (quiz.prompts && wrap(quiz.prompts[promptIdx++]) || '___')
                                                            : context))
                 .join('');
    if (quiz.translation && quiz.translation.en) { prompt += ` (${quiz.translation.en})`; }
    grader = (s: string) => crossMatch(quiz.clozes[0], [s, kata2hira(s)]);

  } else if (quiz.kind === 'card') {
    prompt = quiz.prompt + ((quiz.translation && quiz.translation.en) ? ` (${quiz.translation.en})` : '');
    grader = (s: string) => crossMatch(quiz.responses.concat(quiz.prompt), [s, kata2hira(s)]);
  } else {
    throw new Error('unknown quiz type');
  }

  const [input, setInput] = useState('');

  return ce('div', null, prompt,
            ce('input', {value: input, type: 'text', name: 'name', onChange: e => setInput(e.target.value)}),
            ce('button', {
              onClick: () => {
                const grade = grader(input);
                const summary = (grade ? '🙆‍♂️🙆‍♀️! ' : '🙅‍♀️🙅‍♂️. ') +
                                `「${input}」for ${prompt}`;
                props.update(grade, quiz.uniqueId, summary);
                setInput('');
              }
            },
               'Submit'));
}

function Quizzer(props: {doc: Doc, graph: GraphType, update: (result: boolean, key: string) => any}) {
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
            ce('ul', null, mapRight(pastResults, s => ce('li', {key: s}, s))));
}

type AppState = 'edit'|'learn'|'quiz';
interface DocsGraphs extends Docs {
  graphs: Map<string, GraphType>;
}

function Main() {
  const [db, setDb] = useState(undefined as Db | undefined);
  const defaultDocsGraphs: DocsGraphs = {docs: new Map(), graphs: new Map()};
  const [docs, setDocs] = useState(defaultDocsGraphs);

  async function loader() {
    const newdb = db || web.setup('testing');
    setDb(newdb);

    const newdocs: DocsGraphs = {...await loadDocs(newdb, DOCS_PREFIX), graphs: new Map()};
    {
      const date = new Date();
      const newName = 'New ' + date.toISOString();
      newdocs.docs.set(newName, {title: newName, content: '(empty)', source: undefined, modified: date});
    }
    for (const [key, doc] of newdocs.docs) {
      try {
        newdocs.graphs.set(key, await web.initialize(newdb, doc.content));
      } catch (e) {
        alert('Error caught. See JS Console');
        console.error('Error analyzing text. Skipping', e);
      }
    }
    setDocs(newdocs);
  }
  useEffect(() => { loader(); }, [0]);

  async function updateDoc(doc: Doc) {
    if (!db) { throw new Error('cannot update doc when db undefined'); }
    saveDoc(db, DOCS_PREFIX, doc); // No log FIXME
    try {
      docs.graphs.set(doc.title, await web.initialize(db, doc.content));
    } catch (e) {
      alert('Error caught. See JS Console');
      console.error('Error analyzing text. Skipping', e);
    }
  }

  const defaultState: AppState = 'edit';
  const [state, setState] = useState(defaultState as AppState);

  const [selectedTitle, setSelectedTitle] = useState(undefined as string | undefined);
  const titles = Array.from(docs.docs.keys());
  if (selectedTitle === undefined && titles[0] !== undefined) { setSelectedTitle(titles[0]) }
  const listOfDocs = ce(
      'ul', null,
      titles.map(title => ce('li', {key: title}, title,
                             ce('button', {disabled: title === selectedTitle, onClick: () => setSelectedTitle(title)},
                                'select'))));

  const [updateTrigger, setUpdateTrigger] = useState(0);
  const doc = docs.docs.get(selectedTitle || '');
  const graph = docs.graphs.get(selectedTitle || '');
  const learn = (doc && graph)
                    ? ce(Learn, {doc, graph, learn: (keys: string[]) => db ? web.learnQuizzes(db, keys, graph) : 0})
                    : '';
  const quiz = (doc && graph) ? ce(Quizzer, {
    key: selectedTitle,
    doc,
    graph,
    updateTrigger,
    update: (result: boolean, key: string) => web.updateQuiz(db as Db, result, key, graph)
  })
                              : '';
  const body = state === 'edit' ? ce(Edit, {docs, updateDoc}) : state === 'quiz' ? quiz : learn;

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

function isRawLearned(raw: string, GRAPH: GraphType): boolean {
  const set = GRAPH.raws.get(raw);
  if (!set) { return false; }
  for (const key of set) {
    if (GRAPH.ebisus.has(key)) { return true; }
  }
  return false;
}

function isRawLearnable(raw: string, GRAPH: GraphType): boolean { return GRAPH.raws.has(raw); }
