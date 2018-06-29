//@ts-nocheck
/*global $, app, type*/

"use strict";

const fs = require("fs");
const path = require("path");
const AboutDialog = require("./about-dialog");

const PREFERENCE_KEY = "graphql:preview.visibility";
const PREF_DEBUG_KEY = "graphql:debug.status";
const PREF_GENDOC = "graphql.gen.idlDoc";
const PREF_INDENTSPC = "graphql.gen.indentSpaces";
const PREF_REVASSOC = "graphql.rev.association";
const PREF_REVTYPEH = "graphql.rev.typeHierarchy";

const CMD_TOGGLE_PREVIEW = "graphql:toggle.preview";
const CMD_GENERATE = "graphql:generate";
const CMD_CONFIGURE = "graphql:configure";
const CMD_ABOUT = "graphql:about";

const codeGenerator = require("./idl-code-generator");

// Toolbar Button
const $button = $("<a id='toolbar-graphql' href='#' title='GraphQL Preview'></a>");

const graphqlPanelTemplate = fs.readFileSync(path.join(__dirname, "graphql-panel.html"), "utf8");
let $graphqlPanel;
let graphqlPanel;

// Selected element for preview purposes
let _currentElement;

function getGenOptions() {
  return {
    idlDoc: app.preferences.get(PREF_GENDOC),
    indentSpaces: app.preferences.get(PREF_INDENTSPC),
    debug: app.preferences.get(PREF_DEBUG_KEY)
  };
}

function getRevOptions() {
  return {
    association: app.preferences.get(PREF_REVASSOC),
    typeHierarchy: app.preferences.get(PREF_REVTYPEH),
    debug: app.preferences.get(PREF_DEBUG_KEY)
  };
}

function updateMenus() {
  app.menu.updateStates(null, null, {
    "view.graphql-view": graphqlPanel.isVisible()
  });
}

function generateGraphQL(base, path, options) {
  if (options.debug) {
    console.log("base", base);
    console.log("path", path);
    console.log("options", options);
  }

  try {
    codeGenerator.generate(base, path, options);
    app.toast.info("GraphQL generation completed");
  } catch (e) {
    app.toast.error("Generation Failed!");
  }
}

function openFolder(base, path, options) {
  // If path is not assigned, popup Open Dialog to select a folder
  if (options.debug) console.log("main.openFolder()", "path", path);

  // If path is not assigned, popup Open Dialog to select a folder
  if (!path) {
    const file = app.dialogs.showSaveDialog("Save GraphQL File as...", null, "schema_" + base.name + ".gql");
    if (file) generateGraphQL(base, file, options);
    else generateGraphQL(base, path, options);
  }
}

/**
 * Command Handler for GraphQL Generate
 *
 * @param {Element} base
 * @param {string} path
 * @param {Object} options
 */
function _handleGenerate(base, path, options) {
  // If options is not passed, get from preference
  options = options || getGenOptions();
  // If base is not assigned, popup ElementPicker
  if (!base) {
    app.elementPickerDialog
      .showDialog("Select the package to generate from", null, type.UMLPackage)
      .then(function({ buttonId, returnValue }) {
        if (buttonId === "ok") {
          if (returnValue instanceof type.Project || returnValue instanceof type.UMLPackage) {
            base = returnValue;
            openFolder(base, path, options);
          } else {
            app.dialogs.showErrorDialog("Please select the project or a package");
          }
        }
      });
  } else {
    openFolder(base, path, options);
  }
}

/**
 * Popup PreferenceDialog with Java Preference Schema
 */
function _handleConfigure() {
  app.commands.execute("application:preferences", "graphql");
}

// Handles show/hide actions
function show() {
  graphqlPanel.show();
  $button.addClass("selected");
  updateMenus();
  app.preferences.set(PREFERENCE_KEY, true);
}

function hide() {
  graphqlPanel.hide();
  $button.removeClass("selected");
  updateMenus();
  app.preferences.set(PREFERENCE_KEY, false);
}

function _handleTogglePreview() {
  if (graphqlPanel.isVisible()) {
    hide();
  } else {
    show();
  }
}

function _handleAbout() {
  AboutDialog.showDialog();
}

function setCurrentElement(elem) {
  _currentElement = elem;
  const options = getGenOptions();
  const gql_code = codeGenerator.generateString(elem, options);
  document.getElementById("graphqleditable").innerHTML = gql_code;
}
function init() {
  $graphqlPanel = $(graphqlPanelTemplate);
  const $close = $graphqlPanel.find(".close");
  $close.click(function() {
    hide();
  });
  graphqlPanel = app.panelManager.createBottomPanel("?", $graphqlPanel, 29);

  app.commands.register(CMD_GENERATE, _handleGenerate);
  app.commands.register(CMD_CONFIGURE, _handleConfigure);
  app.commands.register(CMD_TOGGLE_PREVIEW, _handleTogglePreview);
  app.commands.register(CMD_ABOUT, _handleAbout);

  $("#toolbar .buttons").append($button);
  $button.click(function() {
    app.commands.execute(CMD_TOGGLE_PREVIEW);
  });

  // Load Preference
  const visible = app.preferences.get(PREFERENCE_KEY);
  if (visible === true) {
    show();
  } else {
    hide();
  }

  // Handler for selectionChanged event
  app.selections.on("selectionChanged", function(models, views) {
    setCurrentElement(models.length > 0 ? models[0] : null);
  });

  // Handlers for element updated event
  app.repository.on("updated", function(event, elems) {
    if (elems && elems.length === 1 && elems[0] !== _currentElement) {
      setCurrentElement(elems[0]);
    }
  });
}

exports.init = init;
