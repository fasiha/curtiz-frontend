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

function Learn(props: {docs: DocsGraphs, learn: (keys: string[], graph: GraphType) => any}) {
  const titles = Array.from(props.docs.docs.keys());
  const initialTitle = titles[0];
  const [selectedTitle, setSelectedTitle] = useState(initialTitle as string | undefined);
  if (!selectedTitle) { return ce('p', null, 'Go to Edit & add a document'); }

  const doc = props.docs.docs.get(selectedTitle);
  const graph = props.docs.graphs.get(selectedTitle);
  if (!(doc && graph)) { throw new Error('typescript pacification turned out to be necessary'); }
  const list =
      ce('ul', null,
         ...titles.map(title =>
                           ce('li', null, title,
                              ce('button', {disabled: title === selectedTitle, onClick: () => setSelectedTitle(title)},
                                 'select'))));

  const blocks = markdownToBlocks(doc.content);
  return ce(
      'div',
      null,
      list,
      blocks.map((block, i) => ce(Block, {key: selectedTitle + '/' + i, block, graph, learn: props.learn})),
  );
  // Without the `key` above, React confuses different docs: the props are ok but the reducer state is wrong. Why?
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
    newdocs.graphs;
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

  const body = state === 'edit' ? ce(Edit, {docs, updateDoc}) : state === 'quiz' ? ce(Quiz, {}) : ce(Learn, {
    docs,
    learn: (keys: string[], graph: GraphType) => db ? web.learnQuizzes(db, keys, graph) : 0,
  });

  const setStateDebounce = (x: AppState) => (x !== state) && setState(x);
  return ce(
      'div',
      null,
      ce('button', {onClick: () => setStateDebounce('edit')}, 'Edit'),
      ce('button', {onClick: () => setStateDebounce('learn')}, 'Learn'),
      ce('button', {onClick: () => setStateDebounce('quiz')}, 'Quiz'),
      ce('div', null, body),
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
