"use strict";

addMessageListener("stylem:page-info", function(message) {
	sendAsyncMessage(message.data.reply, {
		namespace: content.document.documentElement.namespaceURI,
		contentType: content.document.contentType,
		url: content.document.location.href
	});
});

addMessageListener("stylem:page-content", function(message) {
	sendAsyncMessage(message.data.reply, {
		namespace: content.document.documentElement.namespaceURI,
		contentType: content.document.contentType,
		url: content.document.location.href,
		content: content.document.body.textContent
	});
});
