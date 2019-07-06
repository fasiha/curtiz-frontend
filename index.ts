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

function Learn(props: {doc: Doc, graph: GraphType}) {
  const blocks = markdownToBlocks(props.doc.content);
  const raws = flatten(blocks.map(block => block.map((line, lino) => block[0] + (lino ? '\n' + line : ''))));
  const lines = flatten(blocks);
  const learned = (x: string) => isRawLearned(x, props.graph);
  const learnable = (x: string) => isRawLearnable(x, props.graph);
  // console.log(Array.from(graph.raws.keys()));
  // console.log('lines', lines);
  // console.log('raws', raws);
  return ce('ul', null, lines.map((line, i) => {
    let v = [line, (learnable(raws[i]) ? (learned(raws[i]) ? ' [learned!] ' : ce('button', null, 'learn')) : '')];
    return ce('li', {key: i}, ...v);
  }));
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

  const title = Array.from(docs.docs.keys())[0];
  const body = state === 'edit'
                   ? ce(Edit, {docs, updateDoc})
                   : state === 'quiz'
                         ? ce(Quiz, {})
                         : ce(Learn, {doc: docs.docs.get(title) as Doc, graph: docs.graphs.get(title) as GraphType});

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
