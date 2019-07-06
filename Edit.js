"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = __importStar(require("react"));
var ce = react_1.default.createElement;
function EditableDoc(props) {
    var _a = __read(react_1.useState(props.doc.content), 2), value = _a[0], setValue = _a[1];
    return ce('div', null, props.doc.title, ce('textarea', {
        value: value,
        onChange: function (e) {
            // console.log('onChange', e);
            setValue(e.target.value);
        }
    }), ce('button', {
        onClick: function (_) {
            props.doc.content = value;
            props.doc.modified = new Date();
            props.updateDoc(props.doc);
        }
    }, 'Submit'));
}
function Edit(props) {
    var e_1, _a;
    var rv = [];
    try {
        for (var _b = __values(props.docs.docs.values()), _c = _b.next(); !_c.done; _c = _b.next()) {
            var doc = _c.value;
            rv.push(ce(EditableDoc, { doc: doc, updateDoc: props.updateDoc }));
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return ce.apply(void 0, __spread(['div', null], rv));
}
exports.Edit = Edit;
