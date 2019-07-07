"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __values = (this && this.__values) || function (o) {
    var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
    if (m) return m.call(o);
    return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var curtiz_quiz_planner_1 = require("curtiz-quiz-planner");
var curtiz_utils_1 = require("curtiz-utils");
var web = __importStar(require("curtiz-web-db"));
var react_1 = __importStar(require("react"));
var react_dom_1 = __importDefault(require("react-dom"));
var docs_1 = require("./docs");
var Edit_1 = require("./Edit");
var ce = react_1.default.createElement;
function blockReducer(state, action) {
    if (action.type === 'learn') {
        state.learned[action.payload] = true;
        action.learn();
        return __assign({}, state);
    }
    else {
        throw new Error('unknown action');
    }
}
function Block(props) {
    var raw = props.block.map(function (line, lino) { return props.block[0] + (lino ? '\n' + line : ''); });
    var learned = function (x) { return isRawLearned(x, props.graph); };
    var learnable = function (x) { return isRawLearnable(x, props.graph); };
    var init = { learned: raw.map(function (r) { return learnable(r) ? learned(r) : undefined; }) };
    var _a = __read(react_1.useReducer(blockReducer, init), 2), state = _a[0], dispatch = _a[1];
    return ce('ul', null, props.block.map(function (line, i) { return ce('li', { key: i }, line, state.learned[i] === undefined
        ? ''
        : (state.learned[i] ? ' [learned!] '
            : ce('button', {
                onClick: function () { return dispatch({
                    type: 'learn',
                    payload: i,
                    learn: function () { return props.learn(Array.from(props.graph.raws.get(raw[i]) || []), props.graph); }
                }); }
            }, 'Learn'))); }));
}
function Learn(props) {
    var blocks = markdownToBlocks(props.doc.content);
    return ce('div', null, blocks.map(function (block, i) {
        return ce(Block, { key: props.doc.title + '/' + i, block: block, graph: props.graph, learn: props.learn });
    }));
    // Without `key` above, React doesn't properly handle the reducer.
}
function wrap(s) { return "_(" + s + ")_"; }
function AQuiz(props) {
    var quiz = props.quiz;
    var grader;
    var prompt = '';
    if (quiz.kind === 'cloze') {
        var promptIdx_1 = 0;
        prompt = (quiz.contexts.map(function (context) { return context === null ? (quiz.prompts && wrap(quiz.prompts[promptIdx_1++]) || '___')
            : context; }))
            .join('');
        if (quiz.translation && quiz.translation.en) {
            prompt += " (" + quiz.translation.en + ")";
        }
        grader = function (s) { return s === quiz.clozes[0][0]; };
    }
    else if (quiz.kind === 'card') {
        prompt = quiz.prompt + ((quiz.translation && quiz.translation.en) ? " (" + quiz.translation.en + ")" : '');
        grader = function (s) { return quiz.responses.includes(s); };
    }
    else {
        throw new Error('unknown quiz type');
    }
    var _a = __read(react_1.useState(''), 2), input = _a[0], setInput = _a[1];
    return ce('div', null, prompt, ce('input', { value: input, type: 'text', name: 'name', onChange: function (e) { return setInput(e.target.value); } }), ce('button', {
        onClick: function () {
            props.update(grader(input), quiz.uniqueId);
            setInput('');
        }
    }, 'Submit'));
}
function Quizzer(props) {
    var _a = __read(react_1.useState(undefined), 2), quiz = _a[0], setQuiz = _a[1];
    if (quiz === undefined) {
        var bestQuiz = curtiz_quiz_planner_1.whichToQuiz(props.graph);
        if (bestQuiz !== quiz) {
            setQuiz(bestQuiz);
        }
    }
    if (!quiz) {
        return ce('p', null, 'Nothing to quiz for this document!');
    }
    return ce(AQuiz, {
        update: function (result, key) {
            props.update(result, key);
            setQuiz(curtiz_quiz_planner_1.whichToQuiz(props.graph));
        },
        quiz: quiz
    });
}
function Main() {
    var _a = __read(react_1.useState(undefined), 2), db = _a[0], setDb = _a[1];
    var defaultDocsGraphs = { docs: new Map(), graphs: new Map() };
    var _b = __read(react_1.useState(defaultDocsGraphs), 2), docs = _b[0], setDocs = _b[1];
    function loader() {
        return __awaiter(this, void 0, void 0, function () {
            var newdb, newdocs, _a, date, newName, _b, _c, _d, key, doc_1, _e, _f, _g, e_1_1;
            var e_1, _h;
            return __generator(this, function (_j) {
                switch (_j.label) {
                    case 0:
                        newdb = db || web.setup('testing');
                        setDb(newdb);
                        _a = [{}];
                        return [4 /*yield*/, docs_1.loadDocs(newdb, docs_1.DOCS_PREFIX)];
                    case 1:
                        newdocs = __assign.apply(void 0, _a.concat([_j.sent(), { graphs: new Map() }]));
                        {
                            date = new Date();
                            newName = 'New ' + date.toISOString();
                            newdocs.docs.set(newName, { title: newName, content: '(empty)', source: undefined, modified: date });
                        }
                        _j.label = 2;
                    case 2:
                        _j.trys.push([2, 7, 8, 9]);
                        _b = __values(newdocs.docs), _c = _b.next();
                        _j.label = 3;
                    case 3:
                        if (!!_c.done) return [3 /*break*/, 6];
                        _d = __read(_c.value, 2), key = _d[0], doc_1 = _d[1];
                        _f = (_e = newdocs.graphs).set;
                        _g = [key];
                        return [4 /*yield*/, web.initialize(newdb, doc_1.content)];
                    case 4:
                        _f.apply(_e, _g.concat([_j.sent()]));
                        _j.label = 5;
                    case 5:
                        _c = _b.next();
                        return [3 /*break*/, 3];
                    case 6: return [3 /*break*/, 9];
                    case 7:
                        e_1_1 = _j.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 9];
                    case 8:
                        try {
                            if (_c && !_c.done && (_h = _b.return)) _h.call(_b);
                        }
                        finally { if (e_1) throw e_1.error; }
                        return [7 /*endfinally*/];
                    case 9:
                        setDocs(newdocs);
                        return [2 /*return*/];
                }
            });
        });
    }
    react_1.useEffect(function () { loader(); }, [0]);
    function updateDoc(doc) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!db) {
                            throw new Error('cannot update doc when db undefined');
                        }
                        docs_1.saveDoc(db, docs_1.DOCS_PREFIX, doc); // No log FIXME
                        _b = (_a = docs.graphs).set;
                        _c = [doc.title];
                        return [4 /*yield*/, web.initialize(db, doc.content)];
                    case 1:
                        _b.apply(_a, _c.concat([_d.sent()]));
                        return [2 /*return*/];
                }
            });
        });
    }
    var defaultState = 'edit';
    var _c = __read(react_1.useState(defaultState), 2), state = _c[0], setState = _c[1];
    var _d = __read(react_1.useState(undefined), 2), selectedTitle = _d[0], setSelectedTitle = _d[1];
    var titles = Array.from(docs.docs.keys());
    if (selectedTitle === undefined && titles[0] !== undefined) {
        setSelectedTitle(titles[0]);
    }
    var listOfDocs = ce('ul', null, titles.map(function (title) { return ce('li', { key: title }, title, ce('button', { disabled: title === selectedTitle, onClick: function () { return setSelectedTitle(title); } }, 'select')); }));
    var doc = docs.docs.get(selectedTitle || '');
    var graph = docs.graphs.get(selectedTitle || '');
    var learn = (doc && graph)
        ? ce(Learn, { doc: doc, graph: graph, learn: function (keys) { return db ? web.learnQuizzes(db, keys, graph) : 0; } })
        : '';
    var quiz = (doc && graph) ? ce(Quizzer, {
        key: selectedTitle,
        doc: doc,
        graph: graph,
        update: function (result, key) { return web.updateQuiz(db, result, key, graph); }
    })
        : '';
    var body = state === 'edit' ? ce(Edit_1.Edit, { docs: docs, updateDoc: updateDoc }) : state === 'quiz' ? quiz : learn;
    var setStateDebounce = function (x) { return (x !== state) && setState(x); };
    return ce('div', null, ce('button', { onClick: function () { return setStateDebounce('edit'); } }, 'Edit'), ce('button', { onClick: function () { return setStateDebounce('learn'); } }, 'Learn'), ce('button', { onClick: function () { return setStateDebounce('quiz'); } }, 'Quiz'), ce('div', null, listOfDocs, body));
}
react_dom_1.default.render(ce(Main), document.getElementById('root'));
function markdownToBlocks(md) {
    var re = /^#+\s+.+$/;
    var headers = curtiz_utils_1.partitionBy(md.split('\n'), function (s) { return re.test(s); });
    return headers;
}
function isRawLearned(raw, GRAPH) {
    var e_2, _a;
    var set = GRAPH.raws.get(raw);
    if (!set) {
        return false;
    }
    try {
        for (var set_1 = __values(set), set_1_1 = set_1.next(); !set_1_1.done; set_1_1 = set_1.next()) {
            var key = set_1_1.value;
            if (GRAPH.ebisus.has(key)) {
                return true;
            }
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (set_1_1 && !set_1_1.done && (_a = set_1.return)) _a.call(set_1);
        }
        finally { if (e_2) throw e_2.error; }
    }
    return false;
}
function isRawLearnable(raw, GRAPH) { return GRAPH.raws.has(raw); }
