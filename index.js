"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = __importDefault(require("react"));
var react_dom_1 = __importDefault(require("react-dom"));
var ce = react_1.default.createElement;
var md = "## @ \u5343\u3068\u5343\u5C0B\u306E\u795E\u96A0\u3057 @ \u305B\u3093\u3068\u3061\u3072\u308D\u306E\u304B\u307F\u304C\u304F\u3057\n- @fill \u3068\n- @fill \u306E\n- @ \u5343 @ \u305B\u3093    @pos noun-proper-name-firstname @omit [\u5343]\u3068\n- @ \u5343\u5C0B @ \u3061\u3072\u308D    @pos noun-proper-name-firstname\n- @ \u795E\u96A0\u3057 @ \u304B\u307F\u304C\u304F\u3057    @pos noun-common-general\n- @translation @en Spirited Away (film)\n\nHi there!\n\n## @ \u3053\u306E\u304A\u306F\u306A\u3057\u306B\u51FA\u3066\u6765\u308B\u4EBA\u3073\u3068 @ \u3053\u306E\u304A\u306F\u306A\u3057\u306B\u3067\u3066\u304F\u308B\u3072\u3068\u3073\u3068\n- @fill \u306B\n- @fill \u51FA\u3066\u6765\u308B @ \u3067\u3066\u304F\u308B\n- @ \u8A71 @ \u306F\u306A\u3057    @pos noun-common-verbal_suru @omit \u306F\u306A\u3057\n- @ \u51FA\u308B @ \u3067\u308B    @pos verb-general @omit \u51FA\n- @ \u6765\u308B @ \u304F\u308B    @pos verb-bound\n- @ \u4EBA\u3005 @ \u3072\u3068\u3073\u3068    @pos noun-common-general @omit \u4EBA\u3073\u3068\nWelcome!\n## @ \u6E6F\u5A46\u5A46 @ \u3086\u3070\u30FC\u3070\n- @ \u6E6F\u5A46\u5A46 @ \u3086\u3070\u30FC\u3070    @pos noun-proper-name-general\nYowup!\nYes!\n*Howdy!*!\n";
function Main() { return ce('p', {}, 'Whee!'); }
// let db = web.setup('testing');
react_dom_1.default.render(ce(Main), document.getElementById('root'));
