//@ts-nocheck
/*global $, app, type, __dirname*/

"use strict";

const { shell } = require("electron");
const fs = require("fs");
const path = require("path");

const aboutDialogTemplate = fs.readFileSync(path.join(__dirname, "about-dialog.html"), "utf8");

/**
 * Show About Dialog
 * @private
 * @return {Dialog}
 */
function showDialog() {

  const dialog = app.dialogs.showModalDialogUsingTemplate(aboutDialogTemplate)
  const $dlg = dialog.getElement();
  const $thirdparty = $dlg.find(".thirdparty");

  $thirdparty.click(function() {
    shell.openExternal("http://www.snapcore.com");
  });

  return dialog;
}

exports.showDialog = showDialog;
