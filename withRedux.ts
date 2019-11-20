import {AbstractIterator} from 'abstract-leveldown';
import {Quiz, QuizGraph, QuizKind, textToGraph} from 'curtiz-parse-markdown';
import {KeyToEbisu, whichToQuiz} from 'curtiz-quiz-planner';
import {enumerate, kata2hira, mapRight, partitionBy} from 'curtiz-utils';
import * as web from 'curtiz-web-db';
import {Furigana, furiganaToString, stringToFurigana} from 'jmdict-furigana-node';
import leveljs from 'level-js';
import {LevelUp} from 'levelup';
import React, {useMemo, useRef, useState} from 'react';
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
type Action = ReqDb|SaveDoc|LearnItem|QuizItem;

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

interface LearnItem {
  type: 'learnItem';
  ebisus: GraphType['ebisus'];
}

interface QuizItem {
  type: 'quizItem';
  ebisus: GraphType['ebisus'];
  summary: string;
}

/*
# Step 2. Define your state type and initial state.
*/
interface State {
  db?: Db;
  dbLoading: boolean;
  docs: Doc[];
  graph: GraphType;
  quizSummaries: string[];
}

const INITIAL_STATE: State = {
  db: undefined,
  dbLoading: false,
  docs: [],
  graph: emptyGraph(),
  quizSummaries: [],
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
      return {...state, db: action.db, docs: action.docs, dbLoading: false, graph};
    }
  } else if (action.type === 'saveDoc') {
    const {oldDoc, newDoc} = action;
    const docs = oldDoc ? state.docs.map(doc => doc === oldDoc ? newDoc : doc) : state.docs.concat(newDoc);
    // create fresh graph nodes, edges, and raws from new doc(s), but! reuse ebisus since that doesn't change
    const graph: GraphType = {...emptyGraph(), ebisus: state.graph.ebisus};
    docs.forEach((doc, i) => {textToGraph(doc.content, graph)});
    return {...state, docs, graph};
  } else if (action.type === 'learnItem') {
    const graph = {...state.graph, ebisus: action.ebisus};
    return {...state, graph};
  } else if (action.type === 'quizItem') {
    const graph = {...state.graph, ebisus: action.ebisus};
    const quizSummaries = state.quizSummaries.concat(action.summary);
    return {...state, graph, quizSummaries};
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

function toggleLearnStatusThunk(db: Db, graph: GraphType, uids: string[]) {
  return async (dispatch: Dispatch) => {
    const args = {ebisus: graph.ebisus};
    for (const uid of uids) {
      if (graph.ebisus.has(uid)) {
        await web.unlearnQuizzes(db, [uid], args);
      } else {
        await web.learnQuizzes(db, [uid], args);
      }
    }
    const action: LearnItem = {type: 'learnItem', ebisus: graph.ebisus};
    dispatch(action);
  }
}

function quizItemThunk(db: Db, graph: GraphType, result: boolean, key: string, summary: string) {
  return async (dispatch: Dispatch) => {
    await web.updateQuiz(db, result, key, graph);
    const action: QuizItem = {type: 'quizItem', ebisus: graph.ebisus, summary};
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
      ce('textarea',
         {value: content, onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setContent(e.target.value) }}),
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
  const dispatch = useDispatch();

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
                                                 {onClick: (e) => props.toggleLearnStatus([q.uniqueId])},
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

function useFocus() {
  // Via https://stackoverflow.com/a/54159564/500207
  const ref = useRef(null);
  const focus = () => { ref.current && (ref.current as any).focus() };
  return {focus, ref};
};
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

function Learn(props: {graph: GraphType, update: (result: boolean, key: string, summary: string) => any}) {
  const bestQuiz = whichToQuiz(props.graph);
  const component =
      bestQuiz ? ce(AQuiz, {quiz: bestQuiz, update: props.update}) : ce('div', {}, 'Nothing learned to quiz!');
  const quizSummaries = useSelector((state: State) => state.quizSummaries);
  const quizLis = mapRight(quizSummaries, s => ce('li', {key: s}, FuriganaComponent({furiganaString: s})));
  const summariesComponent = ce('ul', {}, quizLis);
  return ce('div', {}, component, summariesComponent);
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
  const update = (result: boolean, key: string, summary: string) => {
    if (db) { dispatch(quizItemThunk(db, graph, result, key, summary)); }
  };
  const learnProps = {graph, update};
  const toggleLearnStatus = (keys: string[]) => {
    if (db) { dispatch(toggleLearnStatusThunk(db, graph, keys)); }
  };
  const showDocsProps = {graph, docs, toggleLearnStatus};
  return ce(
      'div',
      null,
      ce(Editor, editorProps),
      ce(Learn, learnProps),
      ce(ShowDocs, showDocsProps),
  );
}

// Render!
ReactDOM.render(ce(Provider, {store: store} as any, ce(App)), document.getElementById('root'));