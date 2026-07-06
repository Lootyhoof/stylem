"use strict";

Components.utils.import("resource://gre/modules/Services.jsm");

var stylemManageAddons = {

	getSortButtons: function() {
		return document.getElementById('userstyle-sorting').getElementsByTagName('button');
	},

	getActiveSort: function() {
		var buttons = stylemManageAddons.getSortButtons();
		var checkedButton = Array.filter(buttons, function(b) { return b.hasAttribute('checkState'); })[0];
		if (checkedButton == null) {
			checkedButton = buttons[0];
		}
		var ascending = checkedButton.getAttribute('checkState') != "1";
		var sortBy = checkedButton.getAttribute('sortBy').split(',');
		return [sortBy, ascending];
	},

	changeSort: function(event) {
		var button = event.target;

		// remove checkState from other buttons
		var buttons = stylemManageAddons.getSortButtons();
		Array.filter(buttons, function(b) { return b != button; }).forEach(function(b) { b.removeAttribute("checkState");b.removeAttribute("checked");});

		button.setAttribute('checkState', button.getAttribute('checkState') == "2" ? "1" : "2");
		button.setAttribute("checked", "true");

		stylemManageAddons.applySort();
	},

	applySort: function() {
		var list = document.getElementById('addon-list');
		// this stuff doesn't matter, we're overriding sortElements below
		sortList(list, "name", true);
	},

	startInstallFromUrls: function(button) {
		var startedCallback = function() {
			button.setAttribute("image", "chrome://browser/skin/tabbrowser/connecting.png");
			button.setAttribute("disabled", "true");
		}
		var endedCallback = function() {
			button.setAttribute("image", "");
			button.setAttribute("disabled", "");
		}
		stylishCommon.startInstallFromUrls(startedCallback, endedCallback);
	},

	openAdd: function() {
		// get the chrome window so we can open in tab if necessary
		var win = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].getService(Components.interfaces.nsIWindowWatcher).activeWindow;
		stylishCommon.addCode('', win);
	},

	openSupportPage: function() {
		var item = document.getElementById('addon-list').selectedItem;
		if (item && item.mAddon && item.mAddon.supportURL) {
			var win = Services.wm.getMostRecentWindow("navigator:browser");
			if (win) {
				win.openUILinkIn(item.mAddon.supportURL, "tab");
			}
		}
	}
}

// add some more properties so we can sort on them
stylemManageAddons._createItem = createItem,

(function() {
	var popup = document.getElementById('addonitem-popup');
	if (!popup) return;
	var supportItem = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "menuitem");
	supportItem.setAttribute("id", "menuitem_userstyle_support");
	supportItem.setAttribute("label", "Support Page");
	supportItem.addEventListener("command", function() { stylemManageAddons.openSupportPage(); });
	var editItem = document.getElementById('menuitem_userstyle_edit');
	if (editItem) {
		popup.insertBefore(supportItem, editItem);
	} else {
		popup.appendChild(supportItem);
	}
	popup.addEventListener('popupshowing', function() {
		var item = document.getElementById('addon-list').selectedItem;
		if (item && item.mAddon && item.mAddon.supportURL) {
			supportItem.removeAttribute('disabled');
		} else {
			supportItem.setAttribute('disabled', 'true');
		}
	});
})();
createItem = function(o, aIsInstall, aIsRemote) {
	var item = stylemManageAddons._createItem(o, aIsInstall, aIsRemote);
	if ("mAddon" in item && item.mAddon.type == "userstyle") {
		item.setAttribute("styleTypes", item.mAddon.styleTypes);
		item.setAttribute("reportable", item.mAddon.style.idUrl == null ? false : (item.mAddon.style.idUrl.indexOf("https://userstyles.world/") == 0 || item.mAddon.style.idUrl.indexOf("http://userstyles.org/") == 0 || item.mAddon.style.idUrl.indexOf("https://userstyles.org/") == 0));
	}
	return item;
}

// override sortElements so that we can use a different sort on load
stylemManageAddons._sortElements = sortElements;
sortElements = function(aList, aSortBy, aAscending) {
	if (aList.length == 0 || aList[0].getAttribute("type") != "userstyle") {
		stylemManageAddons._sortElements(aList, aSortBy, aAscending);
		return;
	}
	var sort = stylemManageAddons.getActiveSort();
	stylemManageAddons._sortElements(aList, sort[0], sort[1]);
}