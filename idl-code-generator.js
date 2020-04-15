// @ts-nocheck
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, regexp: true */
/*global define, $, _, window, app, type, document */

"use strict";

const fs = require("fs");
const path = require("path");
const codegen = require("./codegen-utils");

class IDLCodeGenerator {
  constructor(baseModel, basePath) {
    this.baseModel = baseModel;
    this.basePath = basePath;
  }

  /**
   * Return Indent String based on options
   * @param {Object} options
   * @return {string}
   */
  getIndentString(options) {
    if (options.useTab) {
      return "\t";
    } else {
      const len = options.indentSpaces;
      const indent = [];
      for (let i = 0; i < len; i++) {
        indent.push(" ");
      }
      return indent.join("");
    }
  }

  /**
   * Generate codes from a given element
   * @param {type.Model} elem
   * @param {string} path
   * @param {Object} options
   * @return {$.Promise}
   */
  generate(elem, path, options) {
    const codeWriter = new codegen.CodeWriter(this.getIndentString(options));

    if (options.debug) console.log("generate", "elem", elem);

    // Doc
    let doc = "\n";
    const project = app.project.getProject();

    if (project.name && project.name.length > 0) {
      doc += "\nname: " + project.name;
    }
    if (project.version && project.version.length > 0) {
      doc += "\nversion: " + project.version;
    }
    if (project.author && project.author.length > 0) {
      doc += "\nauthor " + project.author;
    }
    if (project.copyright && project.copyright.length > 0) {
      doc += "\ncopyright " + project.copyright;
    }

    this.writeDoc(codeWriter, doc, options);
    codeWriter.writeLine();

    this.recurGenerate(codeWriter, elem, options);

    if (options.debug) console.log("Saving to " + path);

    //const fullPath = path.join(basePath, elem.name);
    fs.writeFileSync(path, codeWriter.getData());
  }

  recurGenerate(codeWriter, elem, options) {
    const self = this;
    let oe;

    // Package
    if (elem instanceof type.UMLPackage || elem instanceof type.Project) {
      oe = elem.ownedElements;
      if (oe) {
        const len = oe.length;
        for (let i = 0; i < len; i++) {
          const e = oe[i];
          self.recurGenerate(codeWriter, e, options);
        }
      }
    } else if (elem instanceof type.UMLClass) {
      if (elem.isAbstract === false) {
        // Class
        if (options.debug) console.log("Class generate " + elem.name);

        if (this.isUnion(elem)) this.writeUnion(codeWriter, elem, options);
        else if (this.isInput(elem)) this.writeClass(codeWriter, elem, options, "input " + elem.name);
        else if (this.isSchema(elem)) this.writeClass(codeWriter, elem, options, "schema");
        else this.writeClass(codeWriter, elem, options);

        codeWriter.writeLine();
      }
    } else if (elem instanceof type.UMLPrimitiveType) {
      // Scalar
      if (options.debug) console.log("Scalar generate" + elem.name);
      this.writeScalar(codeWriter, elem, options);
      codeWriter.writeLine();
    } else if (elem instanceof type.UMLInterface) {
      // Interface
      if (options.debug) console.log("Interface generate" + elem.name);
      this.writeInterface(codeWriter, elem, options);
      codeWriter.writeLine();
    } else if (elem instanceof type.UMLEnumeration) {
      // Enum
      if (options.debug) console.log("Enumeration generate" + elem.name);
      this.writeEnum(codeWriter, elem, options);
      codeWriter.writeLine();
    } else {
      // Others (Nothing generated.)
      if (options.debug) console.log("nothing generate " + elem);
    }
  }

  /**
   * Write Enum
   * @param {StringWriter} codeWriter
   * @param {type.Model} elem
   * @param {Object} options
   */
  writeEnum(codeWriter, elem, options) {
    // Doc
    this.writeDoc(codeWriter, elem.documentation, options);

    codeWriter.writeLine("enum " + elem.name + " {");
    codeWriter.indent();

    // Literals
    const len = elem.literals.length;
    for (let i = 0; i < len; i++) {
      if (elem.literals[i].documentation) {
        codeWriter.writeLine("#" + elem.literals[i].documentation);
      }
      codeWriter.writeLine(elem.literals[i].name);
    }

    codeWriter.outdent();
    codeWriter.writeLine("}");
  }

  /**
   * Write Scalar
   * @param {StringWriter} codeWriter
   * @param {type.Model} elem
   * @param {Object} options
   */
  writeScalar(codeWriter, elem, options) {
    // Doc
    this.writeDoc(codeWriter, elem.documentation, options);
    codeWriter.writeLine("scalar " + elem.name);
  }

  /**
   * Write Interface
   * @param {StringWriter} codeWriter
   * @param {type.Model} elem
   * @param {Object} options
   */
  writeInterface(codeWriter, elem, options) {
    let terms = [];

    // Doc
    this.writeDoc(codeWriter, elem.documentation, options);

    // Interface
    terms.push("interface");
    terms.push(elem.name);

    // Extends
    const _extends = this.getSuperClasses(elem);
    if (_extends.length > 0) {
      terms.push(
        "extends " +
          _extends
            .map(function(e) {
              return e.name;
            })
            .join(", ")
      );
    }
    codeWriter.writeLine(terms.join(" ") + " {");
    codeWriter.writeLine();
    codeWriter.indent();

    // holds {attrName:String -> attrValue:String}
    // doc is modeled as attrName.doc
    const attrDefs = {};

    // Member Variables
    this.recurWriteInterfaceAttributes2(attrDefs, elem, options);

    // render attrDef to codeWriter
    for (const attr in attrDefs) {
      // ignore comments which are coming a "attrname.doc"
      if (attr.indexOf(".") <= 0) {
        const doc = attrDefs[attr + ".doc"];
        if (doc) this.writeDoc(codeWriter, doc, options);

        codeWriter.writeLine(attr + attrDefs[attr]);
      }
    }

    // Methods
    const len = elem.operations.length;
    for (let i = 0; i < len; i++) {
      this.writeMutator(codeWriter, elem.operations[i], options);
      codeWriter.writeLine();
    }

    codeWriter.outdent();
    codeWriter.writeLine("}");
  }

  /**
   * Write Class
   * @param {StringWriter} codeWriter
   * @param {type.Model} elem
   * @param {Object} options
   */
  writeClass(codeWriter, elem, options, keyword) {
    let i, len;
    const terms = [];

    // Doc
    this.writeDoc(codeWriter, elem.documentation, options);

    // Class
    if (keyword) terms.push(keyword);
    else {
      terms.push("type");
      terms.push(elem.name);
    }

    // Extends
    // look for the 1st parent class that is not abstract
    let _extends;
    let e = elem;
    do {
      _extends = this.getSuperClasses(e);
      if (_extends.length > 0) e = _extends[0];
    } while (_extends.length > 0 && _extends[0].isAbstract === true);

    if (_extends.length > 0) {
      if (_extends.length > 1)
        this.writeDoc(codeWriter, "WARNING: you can only extend one class, ignoring others", options);

      if (_extends[0].isAbstract === false) {
        // can graphQL support more than one parent?
        terms.push("extends " + _extends[0].name);
      }
    }

    // Implements
    const _implements = this.getSuperInterfaces(elem);
    if (_implements.length > 0) {
      if (_extends.length > 0) {
        terms.push(
          ", " +
            _implements
              .map(function(e) {
                return e.name;
              })
              .join(", ")
        );
      } else {
        terms.push(
          "implements " +
            _implements
              .map(function(e) {
                return e.name;
              })
              .join(", ")
        );
      }
    }

    codeWriter.writeLine(terms.join(" ") + " {");
    codeWriter.writeLine();
    codeWriter.indent();

    // holds {attrName:String -> attrValue:String}
    // doc is modeled as attrName.doc
    const attrDefs = {};

    // recursive interface attributes
    for (i = 0, len = _implements.length; i < len; i++) {
      this.recurWriteInterfaceAttributes2(attrDefs, _implements[i], options);
    }

    // recursive class attributes
    this.recurWriteClassAttributes2(attrDefs, elem, options);

    // render attrDef to codeWriter
    for (const attr in attrDefs) {
      // ignore comments which are coming a "attrname.doc"
      if (attr.indexOf(".") <= 0) {
        const doc = attrDefs[attr + ".doc"];
        if (doc) this.writeDoc(codeWriter, doc, options);

        codeWriter.writeLine(attr + attrDefs[attr]);
      }
    }

    // mutators
    for (i = 0, len = elem.operations.length; i < len; i++) {
      this.writeMutator(codeWriter, elem.operations[i], options);
      codeWriter.writeLine();
    }

    codeWriter.outdent();
    codeWriter.writeLine("}");
  }

  recurWriteInterfaceAttributes2(attrDefs, elem, options) {
    let i, len;

    // from parent interfaces
    const _extends = this.getSuperClasses(elem);
    for (i = 0, len = _extends.length; i < len; i++) this.recurWriteClassAttributes2(attrDefs, _extends[i], options);

    // Member Variables
    // (from attributes)
    for (i = 0, len = elem.attributes.length; i < len; i++) this.writeAttribute2(attrDefs, elem.attributes[i], options);

    // (from associations)
    const associations = app.repository.getRelationshipsOf(elem, function(rel) {
      return rel instanceof type.UMLAssociation;
    });
    for (i = 0, len = associations.length; i < len; i++) {
      const asso = associations[i];
      if (asso.end2.reference === elem && asso.end1.navigable === true)
        this.writeAttribute2(attrDefs, asso.end1, options);

      if (asso.end1.reference === elem && asso.end2.navigable === true)
        this.writeAttribute2(attrDefs, asso.end2, options);
    }
  }

  recurWriteClassAttributes2(attrDefs, elem, options) {
    let i, len;

    const _extends = this.getSuperClasses(elem);
    if (_extends.length > 0) {
      this.recurWriteClassAttributes2(attrDefs, _extends[0], options);
    }

    // attributes
    for (i = 0, len = elem.attributes.length; i < len; i++) {
      this.writeAttribute2(attrDefs, elem.attributes[i], options);
    }

    // (from associations)
    const associations = app.repository.getRelationshipsOf(elem, function(rel) {
      return rel instanceof type.UMLAssociation;
    });

    if (options.debug) console.log("association length: " + associations.length);
    for (i = 0, len = associations.length; i < len; i++) {
      const asso = associations[i];
      if (asso.end2.reference === elem && asso.end1.navigable === true) {
        this.writeAttribute2(attrDefs, asso.end1, options);
      }
      if (asso.end1.reference === elem && asso.end2.navigable === true) {
        this.writeAttribute2(attrDefs, asso.end2, options);
      }
    }
  }

  /**
   * Write Union
   * @param {StringWriter} codeWriter
   * @param {type.Model} elem
   * @param {Object} options
   */
  writeUnion(codeWriter, elem, options) {
    let i,
      len,
      terms = [];

    // Validations
    const _extends = this.getSuperClasses(elem);
    if (_extends.length > 0)
      this.writeDoc(codeWriter, "WARNING: Inheritance on union types is not GraphQL compliant, ignoring", options);

    const _implements = this.getSuperInterfaces(elem);
    if (_implements.length > 0)
      this.writeDoc(
        codeWriter,
        "WARNING: Implementing interfaces of union types is not GraphQL compliant, ignoring",
        options
      );

    if (elem.operations.length > 0)
      this.writeDoc(codeWriter, "WARNING: Operations on union types is not GraphQL compliant, ignoring.", options);

    if (elem.attributes.length > 0)
      this.writeDoc(codeWriter, "WARNING: Attributes on union types is not GraphQL compliant, ignoring.", options);

    // Class
    terms.push("union");
    terms.push(elem.name);
    terms.push("=");

    // (from dependencies)
    const dependencies = app.repository.getRelationshipsOf(elem, function(rel) {
      return rel instanceof type.UMLDependency;
    });

    if (options.debug) console.log("dependencies length: " + dependencies.length);

    if (dependencies.length > 0) {
      // Doc
      this.writeDoc(codeWriter, elem.documentation, options);

      for (i = 0, len = dependencies.length; i < len; i++) {
        terms.push(dependencies[i].target.name);
        terms.push("|");
      }
      terms.pop();
      codeWriter.writeLine(terms.join(" "));
    }
  }

  /**
   * Write graphQL mutator
   * @param {StringWriter} codeWriter
   * @param {type.Model} elem
   * @param {Object} options
   * @param {boolean} skipBody
   * @param {boolean} skipParams
   */
  writeMutator(codeWriter, elem, options) {
    if (elem.name.length > 0) {
      let e;
      const terms = [];
      const params = elem.getNonReturnParameters();
      const returnParam = elem.getReturnParameter();

      // doc
      let doc = elem.documentation.trim();
      params.forEach(function(param) {
        if (param.documentation.length > 0) doc += "\nparam: " + param.name + " " + param.documentation;
      });
      if (returnParam && returnParam.documentation.length > 0) {
        doc += "\nreturn: " + returnParam.documentation;
      }
      this.writeDoc(codeWriter, doc, options);

      // name + parameters
      const paramTerms = [];

      let i, len;
      for (i = 0, len = params.length; i < len; i++) {
        const p = params[i];
        let s = p.name + ": " + this.getType(p);

        // initial value
        if (p.defaultValue && p.defaultValue.length > 0) {
          s = s + "=" + p.defaultValue;
        }

        paramTerms.push(s);
      }

      terms.push(elem.name + "(" + paramTerms.join(", ") + ")");

      // return type
      if (returnParam) {
        terms.push(":");
        terms.push(this.getType(returnParam));
      }

      // graphql visual directives - modeled as Tags
      const _tags = elem.tags;
      if (_tags) {
        for (i = 0, len = _tags.length; i < len; i++) {
          e = _tags[i];
          terms.push(" @" + e.name + "(" + e.value + ")");
        }
      }

      // graphql non-visible directives - modeled as Constraints
      const _oe = elem.ownedElements;
      if (_oe) {
        for (i = 0, len = _oe.length; i < len; i++) {
          e = _oe[i];
          if (e instanceof type.UMLConstraint) terms.push(" @" + e.name + "(" + e.specification + ")");
        }
      }

      codeWriter.writeLine(terms.join(" "));
    }
  }

  /**
   * Return type expression
   * @param {type.Model} elem
   * @return {string}
   */
  getType(elem) {
    let _type = "String";
    // type name
    if (elem instanceof type.UMLAssociationEnd) {
      if (elem.reference instanceof type.UMLModelElement && elem.reference.name.length > 0) {
        _type = elem.reference.name;
      }
    } else {
      if (elem.type instanceof type.UMLModelElement && elem.type.name.length > 0) {
        _type = elem.type.name;
      } else if (typeof elem.type === "string" && elem.type.length > 0) {
        _type = elem.type;
      }
    }

    // multiplicity

    // | Cardinality property| => Generation |
    // | ------------------- |--------------|
    // |       0..1          |        field |
    // |       1             |       field! |
    // |       n   n>1       |     [field!] |
    // |       0..* or *     |      [field] |
    // |       1..*          |     [field!] |

    if (elem.multiplicity) {
      const m = elem.multiplicity.trim();
      if (["0..1"].includes(m)) {
        //skip
        //_type = _type;
      } else if (["1"].includes(m)) {
        _type = _type + "!";
      } else if (m.match(/^\d+$/)) {
        // number
        _type = "[" + _type + "!]";
      } else if (["0..*", "*"].includes(m)) {
        _type = "[" + _type + "]";
      } else if (["1..*"].includes(m)) {
        _type = "[" + _type + "!]";
      } else {
        console.log("WARNING: We have a problem Houston: unknown cardinality" + _type);
      }
    }
    return _type;
  }

  /**
   * Write type attribute
   * @param {StringWriter} codeWriter
   * @param {type.Model} elem
   * @param {Object} options
   */
  writeAttribute2(attrDefs, elem, options) {
    let i, len;

    if (options.debug) console.log("writeAttribute", "elem", elem);

    let name = elem.name;

    // if it's an association, try to guess the name
    if (name.length === 0 && elem instanceof type.UMLAssociationEnd) {
      name = elem._parent.name;
      if (name.length === 0) {
        // if neither the edge nor the relation has a name, make up a name based on the classname
        // use multiplicity as pluralizer
        name = elem.reference.name;
        if (elem.multiplicity) {
          if (["0", "1", "0..1"].includes(elem.multiplicity.trim())) {
            name = this.pluralize(name, true);
          } else name = this.pluralize(name);
        } else {
          name = this.pluralize(name, true);
        }

        // minimize first latter
        name = name.charAt(0).toLowerCase() + name.slice(1);
      }
    }

    if (name.length > 0) {
      let e;
      const terms = [];
      // doc
      attrDefs[name + ".doc"] = elem.documentation;

      // name
      terms.push(": ");

      // type
      terms.push(this.getType(elem));

      // initial value
      if (elem.defaultValue && elem.defaultValue.length > 0) {
        terms.push("=" + elem.defaultValue);
      }

      // graphql visual directives - modeled as Tags
      const _tags = elem.tags;
      if (_tags) {
        for (i = 0, len = _tags.length; i < len; i++) {
          e = _tags[i];
          terms.push(" @" + e.name + "(" + e.value + ")");
        }
      }

      // graphql non-visible directives - modeled as Constraints
      const _oe = elem.ownedElements;
      if (_oe) {
        for (i = 0, len = _oe.length; i < len; i++) {
          e = _oe[i];
          if (e instanceof type.UMLConstraint) terms.push(" @" + e.name + "(" + e.specification + ")");
        }
      }
      attrDefs[name] = terms.join("");
    }
  }

  /**
   * Write documentation comments
   * @param {StringWriter} codeWriter
   * @param {string} text
   * @param {Object} options
   */
  writeDoc(codeWriter, text, options) {
    let i, len, lines, v;
    if (options.idlDoc && typeof text === "string") {
      lines = text.trim().split("\n");
      if (lines.length > 0) {
        if (lines[0].trim().length > 0) {
          codeWriter.writeLine("\"\"\"");
        }
      }
      for (i = 0, len = lines.length; i < len; i++) {
        v = lines[i].trim();
        if (v.length > 0) codeWriter.writeLine(lines[i]);
      }
      if (lines.length > 0) {
        if (lines[0].trim().length > 0) {        
          codeWriter.writeLine("\"\"\"");
        }
      }
    }
  }

  isUnion(elem) {
    return elem.stereotype === "union";
  }

  isInput(elem) {
    return elem.stereotype === "input";
  }

  isSchema(elem) {
    return elem.stereotype === "schema";
  }

  /**
   * Collect super classes of a given element
   * @param {type.Model} elem
   * @return {Array.<type.Model>}
   */
  getSuperClasses(elem) {
    const generalizations = app.repository.getRelationshipsOf(elem, function(rel) {
      return rel instanceof type.UMLGeneralization && rel.source === elem;
    });
    return generalizations.map(function(gen) {
      return gen.target;
    });
  }

  /**
   * Collect super interfaces of a given element
   * @param {type.Model} elem
   * @return {Array.<type.Model>}
   */
  getSuperInterfaces(elem) {
    const realizations = app.repository.getRelationshipsOf(elem, function(rel) {
      return rel instanceof type.UMLInterfaceRealization && rel.source === elem;
    });
    return realizations.map(function(gen) {
      return gen.target;
    });
  }

  pluralize(str, revert) {
    const plural = {
      "(quiz)$": "$1zes",
      "^(ox)$": "$1en",
      "([m|l])ouse$": "$1ice",
      "(matr|vert|ind)ix|ex$": "$1ices",
      "(x|ch|ss|sh)$": "$1es",
      "([^aeiouy]|qu)y$": "$1ies",
      "(hive)$": "$1s",
      "(?:([^f])fe|([lr])f)$": "$1$2ves",
      "(shea|lea|loa|thie)f$": "$1ves",
      sis$: "ses",
      "([ti])um$": "$1a",
      "(tomat|potat|ech|her|vet)o$": "$1oes",
      "(bu)s$": "$1ses",
      "(alias)$": "$1es",
      "(octop)us$": "$1i",
      "(ax|test)is$": "$1es",
      "(us)$": "$1es",
      "([^s]+)$": "$1s"
    };

    const singular = {
      "(quiz)zes$": "$1",
      "(matr)ices$": "$1ix",
      "(vert|ind)ices$": "$1ex",
      "^(ox)en$": "$1",
      "(alias)es$": "$1",
      "(octop|vir)i$": "$1us",
      "(cris|ax|test)es$": "$1is",
      "(shoe)s$": "$1",
      "(o)es$": "$1",
      "(bus)es$": "$1",
      "([m|l])ice$": "$1ouse",
      "(x|ch|ss|sh)es$": "$1",
      "(m)ovies$": "$1ovie",
      "(s)eries$": "$1eries",
      "([^aeiouy]|qu)ies$": "$1y",
      "([lr])ves$": "$1f",
      "(tive)s$": "$1",
      "(hive)s$": "$1",
      "(li|wi|kni)ves$": "$1fe",
      "(shea|loa|lea|thie)ves$": "$1f",
      "(^analy)ses$": "$1sis",
      "((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses$": "$1$2sis",
      "([ti])a$": "$1um",
      "(n)ews$": "$1ews",
      "(h|bl)ouses$": "$1ouse",
      "(corpse)s$": "$1",
      "(us)es$": "$1",
      s$: ""
    };

    const irregular = {
      move: "moves",
      foot: "feet",
      goose: "geese",
      sex: "sexes",
      child: "children",
      man: "men",
      tooth: "teeth",
      person: "people"
    };

    const uncountable = ["sheep", "fish", "deer", "series", "species", "money", "rice", "information", "equipment"];

    // save some time in the case that singular and plural are the same
    if (uncountable.indexOf(str.toLowerCase()) >= 0) return str;

    let pattern;
    // check for irregular forms
    for (let word in irregular) {
      let replace;
      if (revert) {
        pattern = new RegExp(irregular[word] + "$", "i");
        replace = word;
      } else {
        pattern = new RegExp(word + "$", "i");
        replace = irregular[word];
      }
      if (pattern.test(this)) return str.replace(pattern, replace);
    }

    let array;
    if (revert) array = singular;
    else array = plural;

    // check for matches using regular expressions
    for (let reg in array) {
      pattern = new RegExp(reg, "i");
      if (pattern.test(this)) return str.replace(pattern, array[reg]);
    }

    return str;
  }
}

/**
 * Generate
 * @param {type.Model} baseModel
 * @param {string} basePath
 * @param {Object} options
 */
function generate(baseModel, basePath, options) {
  const codeGenerator = new IDLCodeGenerator(baseModel, basePath);
  codeGenerator.generate(baseModel, basePath, options);
}

function generateString(elem, options) {
  const codeGenerator = new IDLCodeGenerator(elem);
  if (options.debug) {
    console.log("generateString " + elem);
    console.log("options " + options);
  }
  const codeWriter = new codegen.CodeWriter(codeGenerator.getIndentString(options));
  if (options.debug) console.log("codeWriter " + codeWriter);
  codeGenerator.recurGenerate(codeWriter, elem, options);
  if (options.debug) console.log("recurGenerate " + codeWriter);
  return codeWriter.getData();
}

exports.generate = generate;
exports.generateString = generateString;
