import {AbstractIterator} from 'abstract-leveldown';
import {QuizGraph, textToGraph} from 'curtiz-parse-markdown';
import {KeyToEbisu} from 'curtiz-quiz-planner'
import {flatten, partitionBy} from 'curtiz-utils';
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

function Quiz() { return ce('p', null, 'Quizzing!'); }

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
    for (const [key, doc] of newdocs.docs) { newdocs.graphs.set(key, await web.initialize(newdb, doc.content)); }
    setDocs(newdocs);
  }
  useEffect(() => { loader(); }, [0]);

  async function updateDoc(doc: Doc) {
    if (!db) { throw new Error('cannot update doc when db undefined'); }
    saveDoc(db, DOCS_PREFIX, doc); // No log FIXME
    docs.graphs.set(doc.title, await web.initialize(db, doc.content));
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

  const doc = docs.docs.get(selectedTitle || '');
  const graph = docs.graphs.get(selectedTitle || '');
  const learn = (doc && graph)
                    ? ce(Learn, {doc, graph, learn: (keys: string[]) => db ? web.learnQuizzes(db, keys, graph) : 0})
                    : '';
  const body = state === 'edit' ? ce(Edit, {docs, updateDoc}) : state === 'quiz' ? ce(Quiz, {}) : learn;

  const setStateDebounce = (x: AppState) => (x !== state) && setState(x);
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
