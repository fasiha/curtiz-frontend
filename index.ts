import {AbstractBatch, AbstractIterator, AbstractIteratorOptions} from 'abstract-leveldown';
import {Quiz, QuizGraph, QuizKind, textToGraph} from 'curtiz-parse-markdown';
import {KeyToEbisu, whichToQuiz, WhichToQuizOpts} from 'curtiz-quiz-planner';
import {enumerate, kata2hira, mapRight, partitionBy} from 'curtiz-utils';
import * as web from 'curtiz-web-db';
import {Gatty, setup, sync} from 'isomorphic-gatty';
import {Furigana, furiganaToString, stringToFurigana} from 'jmdict-furigana-node';
import leveljs from 'level-js';
import {LevelUp} from 'levelup';
import debounce from 'lodash.debounce';
import React, {useMemo, useRef, useState} from 'react';
import ReactDOM from 'react-dom';
import {Provider, useDispatch, useSelector} from 'react-redux';
import {applyMiddleware, createStore} from 'redux';
import {createLogger} from 'redux-logger';
import thunkMiddleware, {ThunkAction} from 'redux-thunk';

import {Doc, DOCS_PREFIX, docToStorageKey, EventDoc, loadDocs, saveDoc} from './docs';

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
type Action = ReqDb|SaveDoc|LearnItem|QuizItem|LoginAction|Sync|Summary|ToggleProbabilityDisplay|ResetLastSharedUid;

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
  lastSharedUid: string;
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

interface LoginAction {
  type: 'login';
  gatty: Gatty;
}

interface Sync {
  type: 'sync';
  newSharedUid: string;
  newgraph?: GraphType;
  newdocs?: Doc[];
}

interface Summary {
  type: 'summary';
  summary: any;
}
interface ToggleProbabilityDisplay {
  type: 'toggleProbabilityDisplay';
}
interface ResetLastSharedUid {
  type: 'resetLastSharedUid';
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
  gatty?: Gatty;
  lastSharedUid: string;
  summary?: any;
  showProbabilityDisplay: boolean;
}

const INITIAL_STATE: State = {
  db: undefined,
  dbLoading: false,
  docs: [],
  graph: emptyGraph(),
  quizSummaries: [],
  lastSharedUid: '',
  showProbabilityDisplay: false
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
      return {...state, db: action.db, docs: action.docs, dbLoading: false, graph, lastSharedUid: action.lastSharedUid};
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
  } else if (action.type === 'login') {
    return {...state, gatty: action.gatty};
  } else if (action.type === 'sync') {
    const {newSharedUid, newgraph, newdocs} = action;
    const graph: GraphType = newgraph || state.graph;
    const docs: Doc[] = newdocs || state.docs;
    return {...state, lastSharedUid: newSharedUid, graph, docs};
  } else if (action.type === 'summary') {
    return {...state, summary: action.summary};
  } else if (action.type === 'toggleProbabilityDisplay') {
    return { ...state, showProbabilityDisplay: !state.showProbabilityDisplay }
  } else if (action.type === 'resetLastSharedUid') {
    return {...state, lastSharedUid: ''};
  }
  return state;
}

/*
# Step 4. Create thunk creator actions. You can `dispatch` the output of this function.
*/
type ThunkResult<R> = ThunkAction<R, State, undefined, Action>;

function initdb(dbName: string): ThunkResult<void> {
  return async (dispatch) => {
    {
      const started: ReqDbStarted = {type: 'reqDb', status: 'started', dbName};
      dispatch(started);
    }
    {
      const db = web.setup(dbName);
      const docs = await loadDocs(db, DOCS_PREFIX);
      const ebisus = await web.loadEbisus(db);

      let lastSharedUid = '';
      try {
        lastSharedUid = await db.get('lastSharedUid', {asBuffer: false});
      } catch (e) { await db.put('lastSharedUid', ''); }

      const done: ReqDbFinished = {type: 'reqDb', status: 'finished', dbName, db, docs, ebisus, lastSharedUid};
      dispatch(done);
    }
    dispatch(summarizeThunk());
  }
}

function saveDocThunk(db: Db, oldDoc: Doc|undefined, content: string, title: string, date?: Date): ThunkResult<void> {
  return async (dispatch) => {
    date = date || new Date();
    const newDoc: Doc = {...(oldDoc || {source: {type: 'manual', created: date}}), content, title, modified: date};
    await saveDoc(db, DOCS_PREFIX, web.EVENT_PREFIX, newDoc, {date});
    const action: SaveDoc = {type: 'saveDoc', oldDoc, newDoc};
    dispatch(action);
  }
}

function toggleLearnStatusThunk(db: Db, graph: GraphType, uids: string[]): ThunkResult<void> {
  return async (dispatch) => {
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
function quizItemThunk(db: Db, graph: GraphType, result: boolean, key: string, summary: string): ThunkResult<void> {
  return async (dispatch) => {
    await web.updateQuiz(db, result, key, graph);
    const action: QuizItem = {type: 'quizItem', ebisus: graph.ebisus, summary};
    dispatch(action);
  }
}

function loginThunk({username, url, token}: {username: string, url: string, token: string}): ThunkResult<void> {
  return async (dispatch, getState) => {
    const gatty = await setup({corsProxy: 'https://cors.isomorphic-git.org', username, token}, url);
    const action: LoginAction = {type: 'login', gatty};
    dispatch(action);

    const {db, graph, docs, lastSharedUid} = getState();
    if (db) { dispatch(syncThunk(db, graph, docs, lastSharedUid, gatty)); }
  }
}

type CurtizEvent = web.EventLearn|web.EventUnlearn|web.EventUpdate|EventDoc;
async function syncer(db: Db, graph: GraphType, docs: Doc[], lastSharedUid: string, gatty?: Gatty) {
  // console.log('in SYNCER initial', {db, gatty, lastSharedUid});
  if (gatty && db) {
    const opts:
        AbstractIteratorOptions<string> = {gt: web.EVENT_PREFIX + lastSharedUid, lt: web.EVENT_PREFIX + '\ufe0f'};
    const res = await web.summarizeDb(db, opts);
    // console.log('BEFORE sync, in syncer', {res, lastSharedUid});
    const {newEvents, newSharedUid} =
        await sync(gatty, lastSharedUid, res.map(o => o.value.uid), res.map(o => JSON.stringify(o.value)));
    console.log('!AFTER sync in syncer', {newEvents, newSharedUid});

    // if something recent was shared, or something old synced only now:

    if (newSharedUid !== lastSharedUid || newEvents.length) {
      const syncAction: Sync = {type: 'sync', newSharedUid};
      const events: CurtizEvent[] = newEvents.map(s => JSON.parse(s[1]));
      const batch: AbstractBatch[] = [{type: 'put', key: 'lastSharedUid', value: newSharedUid}];
      const newDocs: Map<string, Doc> = new Map();
      {
        const dbKeyToBatch: Map<string, AbstractBatch> = new Map([]);
        for (const e of events) {
          // event should be committed to local db as is
          batch.push({type: 'put', key: web.EVENT_PREFIX + e.uid, value: e});
          // local db should update the things the events talk about too!
          if (e.action === 'learn' || e.action === 'update') {
            const hit = graph.ebisus.get(e.key);
            // add to our db if either we haven't learned it or if we have, we reviewed it before the remote event
            if (!hit || e.date > hit.lastDate) {
              const key = web.EBISU_PREFIX + e.key;
              dbKeyToBatch.set(key, {type: 'put', key, value: e.ebisu});
            }
          } else if (e.action === 'doc') {
            const key = docToStorageKey(e.doc, DOCS_PREFIX);
            const hit = docs.find(doc => docToStorageKey(doc, DOCS_PREFIX) === key);
            if (!hit || e.date > hit.modified) {
              dbKeyToBatch.set(key, {type: 'put', key, value: e.doc});
              newDocs.set(key, e.doc);
            }
          } else if (e.action === 'unlearn') {
            const hit = graph.ebisus.get(e.key);
            // again, DELETE this card from our database only if we HAVE learned it and reviewed it before it was
            // deleted remotely
            if (hit && e.date > hit.lastDate) {
              const key = web.EBISU_PREFIX + e.key;
              dbKeyToBatch.set(key, {type: 'del', key});
            }
          } else {
            throw new Error('unhandled event action');
          }
        }
        for (const value of dbKeyToBatch.values()) { batch.push(value); }
      }
      // write new ebisus and docs to local database
      await db.batch(batch);
      if (graph && batch.length) {
        const newGraph: GraphType = {
          ebisus: new Map(graph.ebisus),
          edges: new Map(graph.edges),
          nodes: new Map(graph.nodes),
          raws: new Map(graph.raws),
        };
        for (const doc of newDocs.values()) { textToGraph(doc.content, newGraph); }
        // reread local database (now modified) with new ebisus
        const finalGraph: GraphType = {...newGraph, ...await web.loadEbisus(db)};

        // append or update docs array
        const newDocsArr = docs.slice();
        for (const [k, v] of newDocs) {
          const didx = newDocsArr.findIndex(doc => docToStorageKey(doc, DOCS_PREFIX) === k);
          if (didx >= 0) {
            newDocsArr.splice(didx, 1, v);
          } else {
            newDocsArr.push(v);
          }
        }
        syncAction.newdocs = newDocsArr;
        syncAction.newgraph = finalGraph;
      }
      syncAction.newSharedUid = newSharedUid;
      return syncAction;
    }
  }
}
function syncThunk(db: Db, graph: GraphType, docs: Doc[], lastSharedUid: string, gatty?: Gatty,
                   immediate = true): ThunkResult<void> {
  return async (dispatch) => {
    const action = await (immediate ? syncer : syncerDebounced)(db, graph, docs, lastSharedUid, gatty);
    if (action) { dispatch(action); }
  }
}
const syncerDebounced = debounce(syncer, 10e3, {maxWait: 60e3, leading: false, trailing: true});

function summarizeThunk(): ThunkResult<void> {
  return async (dispatch, getState) => {
    const {db} = getState();
    if (db) {
      const summary = await web.summarizeDb(db);
      const action: Summary = {type: 'summary', summary};
      dispatch(action);
    }
  };
}

function resetThunk(): ThunkResult<void> {
  return async (dispatch, getState) => {
    const {db} = getState();
    if (db) {
      await db.put('lastSharedUid', '');
      dispatch({type: 'resetLastSharedUid'});
    }
  }
}

function deleteThunk(): ThunkResult<void> {
  return async (dispatch, getState) => {
    const {db} = getState();
    if (db) {
      await web.deleteDb(db);
      location.reload();
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
      ce('button', {onClick: (_: any) => { props.saveDoc(props.doc, content, title, props.doc.source.created); }},
         'Submit'),
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

  for (const doc of props.docs) {
    const blocks = markdownToBlocks(doc.content);
    for (const [blocknum, block] of enumerate(blocks)) {
      for (const [lino, line] of enumerate(block)) {
        const htmlTag =
            line.startsWith('###')
                ? 'h3'
                : line.startsWith('## ') ? 'h2' : line.startsWith('# ') ? 'h1' : line.startsWith('- @') ? 'div' : '';

        const uids = props.graph.raws.get(lino === 0 ? line : block[0] + '\n' + line);
        const lineFuri = line.startsWith('- @furigana') ? FuriganaComponent({furiganaString: line}) : line;
        const key = [doc.title, blocknum, lino].join('/');
        if (uids) {
          const quizs = Array.from(uids, uid => props.graph.nodes.get(uid));
          const describe = (q: Quiz|undefined) =>
              q ? ('subkind' in q ? `${q.subkind} ` : '') + q.kind + (props.graph.ebisus.has(q.uniqueId) ? ' 👍' : ' ❓')
                : 'unknown?';
          const buttons = quizs.map(q => q ? ce(
                                                 'button',
                                                 {onClick: (e) => props.toggleLearnStatus([q.uniqueId])},
                                                 describe(q),
                                                 )
                                           : '');
          lis.push(ce('li', {key}, htmlTag ? ce(htmlTag, {}, lineFuri) : lineFuri, ...buttons));
        } else {
          lis.push(ce('li', {key}, htmlTag ? ce(htmlTag, {}, lineFuri) : lineFuri));
        }
      }
    }
  }
  return ce('ul', {id: 'docs-list'}, lis);
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
      prompt = `Enter numbers (without spaces) to match ${texts.join('。 ')}。 Choices: ・${shuffledTls.join(' ・')}`;
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

function Learn(props: {
  showProbabilityDisplay: boolean,
  graph: GraphType,
  update: (result: boolean, key: string, summary: string) => any
}) {
  const opts: WhichToQuizOpts = {details: {out: []}};
  const bestQuiz = whichToQuiz(props.graph, props.showProbabilityDisplay ? opts : undefined);
  const component =
      bestQuiz ? ce(AQuiz, {quiz: bestQuiz, update: props.update}) : ce('div', {}, 'Nothing learned to quiz!');
  const quizSummaries = useSelector((state: State) => state.quizSummaries);
  const quizLis = mapRight(quizSummaries, s => ce('li', {key: s}, FuriganaComponent({furiganaString: s})));
  const summariesComponent = ce('ul', {}, quizLis);

  const dispatch = useDispatch();
  const toggle = ce('button', {onClick: () => dispatch({type: 'toggleProbabilityDisplay'})},
                    'Toggle flashcard probability analysis')
  if (props.showProbabilityDisplay) {
    if (opts.details && opts.details.out) { opts.details.out.sort((a, b) => (a.precall || 0) - (b.precall || 0)); }
    const vec = opts.details &&
                opts.details.out.map(({key, precall, model, date}) =>
                                         ce('li', {key},
                                            `${Math.exp(precall || 0).toFixed(4)}, [${
                                                model ? model.map(s => s.toFixed(2)).join(', ') : ''}], ${key}`));
    const details = ce('details', {}, ce('summary', {}, 'Quiz details'), ce('ul', {}, ...(vec || [])));
    return ce('div', {}, component, summariesComponent, toggle, details);
  }
  return ce('div', {}, component, summariesComponent, toggle);
}

function Login(props: {}) {
  const [url, setURL] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const dispatch = useDispatch();

  const gatty = useSelector((state: State) => state.gatty);
  if (gatty) { return ce('div', {}, 'Logged in! Refresh to log out. ', ce(SyncButton)); }

  return ce(
      'div',
      null,
      ce(
          'form',
          {
            onSubmit: (e: any) => {
              e.preventDefault();
              dispatch(loginThunk({username, url, token}));
            }
          },
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
              ce('label', null, 'Token'),
              ce('input', {type: 'password', value: token, onChange: e => setToken(e.target.value)}),
              ),
          ce('input', {type: 'submit', value: 'Login'}),
          ),
  );
}

function Summary() {
  const {summary} = useSelector(({summary}: State) => ({summary}));
  return ce('div', {}, ce('pre', {style: {whitespace: 'pre-warp'}}, JSON.stringify(summary, null, 1)));
}

function SyncButton() {
  const {db, docs, graph, lastSharedUid, gatty} =
      useSelector(({db, docs, graph, lastSharedUid, gatty}: State) => ({db, docs, graph, lastSharedUid, gatty}));
  const dispatch = useDispatch();
  if (db) {
    return ce('div', {},
              ce('button', {onClick: () => dispatch(syncThunk(db, graph, docs, lastSharedUid, gatty))}, 'Sync'));
  }
  return ce('div', {}, '');
}
function ResetRemote() {
  const dispatch = useDispatch();
  return ce(
      'details',
      {},
      ce('summary', {}, '💀 Resets ☣️'),
      ce('button', {onClick: () => dispatch(resetThunk())}, 'Reset local'),
      ce('button', {onClick: () => { dispatch(deleteThunk()) }}, 'Delete local'),
  );
}

function App() {
  const {db, docs, dbLoading, graph, lastSharedUid, gatty, showProbabilityDisplay} =
      useSelector(({db, docs, dbLoading, graph, lastSharedUid, gatty, showProbabilityDisplay}: State) =>
                      ({db, docs, dbLoading, graph, lastSharedUid, gatty, showProbabilityDisplay}));
  const dispatch = useDispatch();
  if (!db && !dbLoading) { dispatch(initdb('testing')) }
  const saveDoc: SaveDocType = (doc: Doc|undefined, contents: string, title: string, date?: Date) => {
    if (db) {
      dispatch(saveDocThunk(db, doc, contents, title, date));
      dispatch(syncThunk(db, graph, docs, lastSharedUid, gatty));
    }
  };

  const editorProps: EditorProps = {docs, saveDoc};
  const update = (result: boolean, key: string, summary: string) => {
    if (db) {
      dispatch(quizItemThunk(db, graph, result, key, summary));
      dispatch(syncThunk(db, graph, docs, lastSharedUid, gatty, false));
    }
  };
  const learnProps = {graph, update, showProbabilityDisplay};
  const toggleLearnStatus = (keys: string[]) => {
    if (db) {
      dispatch(toggleLearnStatusThunk(db, graph, keys));
      dispatch(syncThunk(db, graph, docs, lastSharedUid, gatty, false));
    }
  };
  const showDocsProps = {graph, docs, toggleLearnStatus};
  return ce(
      'div',
      null,
      ce(Login),
      ce(ResetRemote),
      ce(Editor, editorProps),
      ce(Learn, learnProps),
      ce(ShowDocs, showDocsProps),
      // ce(Summary),
  );
}

// Render!
ReactDOM.render(ce(Provider, {store: store} as any, ce(App)), document.getElementById('root'));