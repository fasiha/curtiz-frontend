import {AbstractIterator} from 'abstract-leveldown';
import {Quiz, QuizGraph, textToGraph} from 'curtiz-parse-markdown';
import {KeyToEbisu} from 'curtiz-quiz-planner';
import {enumerate, partitionBy} from 'curtiz-utils';
import * as web from 'curtiz-web-db';
import {Furigana, stringToFurigana} from 'jmdict-furigana-node';
import leveljs from 'level-js';
import {LevelUp} from 'levelup';
import React, {useState} from 'react';
import ReactDOM from 'react-dom';
import {Provider, useDispatch, useSelector} from 'react-redux';
import {applyMiddleware, createStore, Dispatch} from 'redux';
import {createLogger} from 'redux-logger';
import thunkMiddleware from 'redux-thunk';

import {Doc, DOCS_PREFIX, loadDocs, saveDoc} from './docs';

export type Db = LevelUp<leveljs, AbstractIterator<any, any>>;
type GraphType = QuizGraph&KeyToEbisu; // ebisus, nodes, edges, raws
function emptyGraph(): GraphType { return {ebisus: new Map(), edges: new Map(), nodes: new Map(), raws: new Map()}; }

/*
# Step 1. Set up your action types.

Each async call should have three actions:
1. Started
2. Finished
3. Errored (optional if the async call can't error, like Leveljs).

Each synchronous action just needs a single action type.

Just types, nothing else.
*/
type Action = ReqDb|SaveDoc;

interface ReqDbBase {
  type: 'reqDb';
  dbName: string;
  status: 'started'|'finished';
}
interface ReqDbStarted extends ReqDbBase {
  status: 'started';
}
interface ReqDbFinished extends ReqDbBase {
  status: 'finished';
  db: Db;
  docs: Doc[];
  ebisus: KeyToEbisu;
}
type ReqDb = ReqDbStarted|ReqDbFinished;

interface SaveDoc {
  type: 'saveDoc';
  oldDoc?: Doc;
  newDoc: Doc;
}

/*
# Step 2. Define your state type and initial state.
*/
interface State {
  db?: Db;
  dbLoading: boolean;
  docs: Doc[];
  graph: GraphType;
}

const INITIAL_STATE: State = {
  db: undefined,
  dbLoading: false,
  docs: [],
  graph: emptyGraph(),
};

/*
# Step 3. Create your reducer that maps `state -> action -> state`.
This is a fully synchronous function, nothing weird or async here.
*/
function rootReducer(state = INITIAL_STATE, action: Action): State {
  if (action.type === 'reqDb') {
    if (action.status === 'started') {
      return {...INITIAL_STATE, dbLoading: true};
    } else {
      const graph: GraphType = {...emptyGraph(), ...action.ebisus};
      action.docs.forEach(doc => textToGraph(doc.content, graph));
      return {db: action.db, docs: action.docs, dbLoading: false, graph};
    }
  } else if (action.type === 'saveDoc') {
    const {oldDoc, newDoc} = action;
    const docs = oldDoc ? state.docs.map(doc => doc === oldDoc ? newDoc : doc) : state.docs.concat(newDoc);
    const graph: GraphType = {...emptyGraph(), ebisus: state.graph.ebisus};
    docs.forEach((doc, i) => {textToGraph(doc.content, graph)});
    return {...state, docs, graph};
  }
  return state;
}

/*
# Step 4. Create thunk creator actions. You can `dispatch` the output of this function.
*/
function initdb(dbName: string) {
  return async (dispatch: Dispatch) => {
    {
      const started: ReqDbStarted = {type: 'reqDb', status: 'started', dbName};
      dispatch(started);
    }
    {
      const db = web.setup(dbName);
      const docs = await loadDocs(db, DOCS_PREFIX);
      const ebisus = await web.loadEbisus(db);
      const done: ReqDbFinished = {type: 'reqDb', status: 'finished', dbName, db, docs, ebisus};
      dispatch(done);
    }
  }
}

function saveDocThunk(db: Db, oldDoc: Doc|undefined, content: string, title: string, date?: Date) {
  return async (dispatch: Dispatch) => {
    date = date || new Date();
    const newDoc: Doc = {...(oldDoc || {source: {type: 'manual', created: date}}), content, title, modified: date};
    await saveDoc(db, DOCS_PREFIX, web.EVENT_PREFIX, newDoc, {date});
    const action: SaveDoc = {type: 'saveDoc', oldDoc, newDoc};
    dispatch(action);
  }
}

/*
# Step 5. Create the store.
*/
const loggerMiddleware = createLogger()
const store = createStore(rootReducer, applyMiddleware(thunkMiddleware, loggerMiddleware));

/*
# Step 6. Create the presentation components.
*/
const ce = React.createElement;
type SaveDocType = (doc: Doc|undefined, contents: string, title: string, date?: Date) => void;

function EditableDoc(props: {doc: Doc, saveDoc: SaveDocType}) {
  const [content, setContent] = useState(props.doc.content);
  const [title, setTitle] = useState(props.doc.title);
  return ce(
      'div',
      null,
      ce('input', {type: 'text', value: title, onChange: e => setTitle(e.target.value)}),
      ce('textarea', {
        value: content,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          // console.log('onChange', e);
          setContent(e.target.value)
        }
      }),
      ce('button', {onClick: (_: any) => { props.saveDoc(props.doc, content, title, new Date()); }}, 'Submit'),
  )
}

type EditorProps = {
  docs: Doc[],
  saveDoc: SaveDocType
};
function Editor(props: EditorProps) {
  return ce(
      'div',
      null,
      ce('button', {onClick: () => { props.saveDoc(undefined, 'New document', 'new-doc'); }}, '++'),
      ce('p', null, props.docs.length + ' docs!'),
      ...props.docs.map(doc => ce(EditableDoc, {doc, saveDoc: props.saveDoc})),
  );
}

type GraphViewerProps = {
  graph: GraphType
};
function GraphViewer(props: GraphViewerProps) {
  return ce(
      'pre', null,
      JSON.stringify(Object.entries(props.graph).map(([key, val]) => ({[key]: Array.from(val as any)})), null, 1));
}

function FuriganaComponent(props: {furigana?: Furigana[], furiganaString?: string}) {
  const arr = [];
  for (const f of (props.furigana || stringToFurigana(props.furiganaString || ''))) {
    arr.push(typeof f === 'string' ? f : ce('ruby', null, f.ruby, ce('rt', null, f.rt)));
  }
  return ce('span', {}, ...arr);
}

function markdownToBlocks(md: string) {
  const re = /^#+\s+.+$/;
  const headers = partitionBy(md.split('\n'), s => re.test(s));
  return headers;
}

function ShowDocs(props: {docs: Doc[], graph: GraphType, toggleLearnStatus: (keys: string[]) => void}) {
  const li = ce('li'); // solely used to get type without hardcoding :P
  type Li = typeof li;
  const lis: Li[] = [];
  for (const doc of props.docs) {
    const blocks = markdownToBlocks(doc.content);
    for (const [blocknum, block] of enumerate(blocks)) {
      for (const [lino, line] of enumerate(block)) {
        const uids = props.graph.raws.get(lino === 0 ? line : block[0] + '\n' + line);
        const furi = line.startsWith('- @furigana') ? FuriganaComponent({furiganaString: line}) : line;
        const key = [doc.title, blocknum, lino].join('/');
        if (uids) {
          const quizs = Array.from(uids, uid => props.graph.nodes.get(uid));
          const describe = (q: Quiz|undefined) => q ? ('subkind' in q ? `${q.subkind} ` : '') + q.kind +
                                                          (props.graph.ebisus.has(q.uniqueId) ? ' unlearn' : ' learn')
                                                    : 'unknown';
          const buttons = quizs.map(q => q ? ce(
                                                 'button',
                                                 {
                                                   onClick: (e) => {
                                                     //  e.persist();
                                                     //  console.log(e);
                                                     props.toggleLearnStatus([q.uniqueId]);
                                                   }
                                                 },
                                                 describe(q),
                                                 )
                                           : '');
          lis.push(ce('li', {key}, furi, ...buttons));
        } else {
          lis.push(ce('li', {key}, furi));
        }
      }
    }
  }
  return ce('ul', {}, lis);
}

function App() {
  const {db, docs, dbLoading, graph} =
      useSelector(({db, docs, dbLoading, graph}: State) => ({db, docs, dbLoading, graph}));
  const dispatch = useDispatch();
  if (!db && !dbLoading) { dispatch(initdb('testing')) }
  const saveDoc: SaveDocType = (doc: Doc|undefined, contents: string, title: string, date?: Date) => {
    if (db) { dispatch(saveDocThunk(db, doc, contents, title, date)); }
  };

  const editorProps: EditorProps = {docs, saveDoc};
  const graphViewProps: GraphViewerProps = {graph};
  const toggleLearnStatus = (keys: string[]) => {
    if (db && graph) {
      const args = {ebisus: graph.ebisus};
      for (const key of keys) {
        if (graph.ebisus.has(key)) {
          web.unlearnQuizzes(db, [key], args);
        } else {
          web.learnQuizzes(db, [key], args);
        }
      }
    }
  };
  const showDocsProps = {graph, docs, toggleLearnStatus};
  return ce('div', null, ce(Editor, editorProps), ce(ShowDocs, showDocsProps), ce(GraphViewer, graphViewProps));
}

// Render!
ReactDOM.render(ce(Provider, {store: store} as any, ce(App)), document.getElementById('root'));