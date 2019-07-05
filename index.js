"use strict";
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
var __spread = (this && this.__spread) || function () {
    for (var ar = [], i = 0; i < arguments.length; i++) ar = ar.concat(__read(arguments[i]));
    return ar;
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
var curtiz_utils_1 = require("curtiz-utils");
var web = __importStar(require("curtiz-web-db"));
var react_1 = __importDefault(require("react"));
var react_dom_1 = __importDefault(require("react-dom"));
var Edit_1 = require("./Edit");
var ce = react_1.default.createElement;
var md = "## @ \u5343\u3068\u5343\u5C0B\u306E\u795E\u96A0\u3057 @ \u305B\u3093\u3068\u3061\u3072\u308D\u306E\u304B\u307F\u304C\u304F\u3057\n- @fill \u3068\n- @fill \u306E\n- @ \u5343 @ \u305B\u3093    @pos noun-proper-name-firstname @omit [\u5343]\u3068\n- @ \u5343\u5C0B @ \u3061\u3072\u308D    @pos noun-proper-name-firstname\n- @ \u795E\u96A0\u3057 @ \u304B\u307F\u304C\u304F\u3057    @pos noun-common-general\n- @translation @en Spirited Away (film)\n\nHi there!\n\n## @ \u3053\u306E\u304A\u306F\u306A\u3057\u306B\u51FA\u3066\u6765\u308B\u4EBA\u3073\u3068 @ \u3053\u306E\u304A\u306F\u306A\u3057\u306B\u3067\u3066\u304F\u308B\u3072\u3068\u3073\u3068\n- @fill \u306B\n- @fill \u51FA\u3066\u6765\u308B @ \u3067\u3066\u304F\u308B\n- @ \u8A71 @ \u306F\u306A\u3057    @pos noun-common-verbal_suru @omit \u306F\u306A\u3057\n- @ \u51FA\u308B @ \u3067\u308B    @pos verb-general @omit \u51FA\n- @ \u6765\u308B @ \u304F\u308B    @pos verb-bound\n- @ \u4EBA\u3005 @ \u3072\u3068\u3073\u3068    @pos noun-common-general @omit \u4EBA\u3073\u3068\nWelcome!\n## @ \u6E6F\u5A46\u5A46 @ \u3086\u3070\u30FC\u3070\n- @ \u6E6F\u5A46\u5A46 @ \u3086\u3070\u30FC\u3070    @pos noun-proper-name-general\nYowup!\nYes!\n*Howdy!*!\n";
function markdownToBlocks(md) {
    var re = /^#+\s+.+$/;
    var headers = curtiz_utils_1.partitionBy(md.split('\n'), function (s) { return re.test(s); });
    return headers;
}
var blocks = markdownToBlocks(md);
var GRAPH;
var DB;
function setup() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    DB = web.setup('testing');
                    return [4 /*yield*/, web.initialize(DB, md)];
                case 1:
                    GRAPH = _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function isRawLearned(raw, GRAPH) {
    var e_1, _a;
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
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (set_1_1 && !set_1_1.done && (_a = set_1.return)) _a.call(set_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return false;
}
function isRawLearnable(raw, GRAPH) { return GRAPH.raws.has(raw); }
function Main() {
    var raws = curtiz_utils_1.flatten(blocks.map(function (block) { return block.map(function (line, lino) { return block[0] + (lino ? '\n' + line : ''); }); }));
    var lines = curtiz_utils_1.flatten(blocks);
    var learned = function (x) { return isRawLearned(x, GRAPH); };
    var learnable = function (x) { return isRawLearnable(x, GRAPH); };
    // console.log(Array.from(graph.raws.keys()));
    // console.log('lines', lines);
    // console.log('raws', raws);
    return ce('ul', null, lines.map(function (line, i) {
        var v = [line, (learnable(raws[i]) ? (learned(raws[i]) ? ' [learned!] ' : ce('button', null, 'learn')) : '')];
        return ce.apply(void 0, __spread(['li', { key: i }], v));
    }));
}
setup().then(function () { return react_dom_1.default.render(ce(Edit_1.Edit, { db: DB, reloadCount: 0 }), document.getElementById('root')); });
