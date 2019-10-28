import {AbstractIterator} from 'abstract-leveldown';
import * as web from 'curtiz-web-db';
import leveljs from 'level-js';
import {LevelUp} from 'levelup';
import React, {useState} from 'react';
import ReactDOM from 'react-dom';
import {connect, Provider, useDispatch, useSelector} from 'react-redux';
import {applyMiddleware, createStore, Dispatch} from 'redux';
import {createLogger} from 'redux-logger';
import thunkMiddleware from 'redux-thunk';

import {Doc, DOCS_PREFIX, loadDocs} from './docs';

export type Db = LevelUp<leveljs, AbstractIterator<any, any>>;

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
}
type ReqDb = ReqDbStarted|ReqDbFinished;
interface SaveDoc {
  type: 'saveDoc';
  oldDoc: Doc;
  title: string;
  contents: string;
  date: Date;
}

/*
# Step 2. Define your state type and initial state.
*/
interface State {
  db?: Db;
  docs: Doc[];
}

const INITIAL_STATE: State = {
  db: undefined,
  docs: []
};

/*
# Step 3. Create your reducer that maps `state -> action -> state`.
This is a fully synchronous function, nothing weird or async here.
*/
function rootReducer(state = INITIAL_STATE, action: Action): State {
  if (action.type === 'reqDb') {
    if (action.status === 'started') {
      return {db: undefined, docs: []};
    } else if (action.status === 'finished') {
      return {db: action.db, docs: action.docs};
    } else {
      throw new Error('unknown action.status');
    }
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
      const done: ReqDbFinished = {type: 'reqDb', status: 'finished', dbName, db, docs};
      dispatch(done);
    }
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
type SaveDocType = (doc: Doc, contents: string, title: string, date?: Date) => void;

function EditableDoc(props: {doc: Doc, saveDoc: SaveDocType}) {
  const [value, setValue] = useState(props.doc.content);
  return ce(
      'div',
      null,
      props.doc.title,
      ce('textarea', {
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          // console.log('onChange', e);
          setValue(e.target.value)
        }
      }),
      ce('button', {onClick: (_: any) => { props.saveDoc(props.doc, value, props.doc.title, new Date()); }}, 'Submit'),
  )
}

type EditorProps = {
  docs: Doc[],
  saveDoc: SaveDocType
};
function Editor(props: EditorProps) {
  return ce('div', null, ce('p', null, props.docs.length + ' docs!'),
            ...props.docs.map(doc => ce(EditableDoc, {doc, saveDoc: props.saveDoc})));
}

function App() {
  const {db, docs} = useSelector((state: State) => ({db: state.db, docs: state.docs}));
  const dispatch = useDispatch();
  if (!db) { dispatch(initdb('testing')) }
  const saveDoc: SaveDocType = (doc: Doc, contents: string, title: string, date?: Date) => {
    const action: SaveDoc = {type: 'saveDoc', oldDoc: doc, title, contents, date: date || new Date()};
    dispatch(action);
  };

  return ce(Editor, {docs, saveDoc});
}

// Render!
ReactDOM.render(ce(Provider, {store: store} as any, ce(App)), document.getElementById('root'));