/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.SimpleView}
 * @param {string} mimeType
 * @param {!WebInspector.ContentProvider} contentProvider
 */
WebInspector.FontView = function(mimeType, contentProvider)
{
    WebInspector.SimpleView.call(this, WebInspector.UIString("Font"));
    this.registerRequiredCSS("source_frame/fontView.css");
    this.element.classList.add("font-view");
    this._url = contentProvider.contentURL();
    this._mimeType = mimeType;
    this._contentProvider = contentProvider;
    this._mimeTypeLabel = new WebInspector.ToolbarText(mimeType);
}

WebInspector.FontView._fontPreviewLines = [ "ABCDEFGHIJKLM", "NOPQRSTUVWXYZ", "abcdefghijklm", "nopqrstuvwxyz", "1234567890" ];

WebInspector.FontView._fontId = 0;

WebInspector.FontView._measureFontSize = 50;

WebInspector.FontView.prototype = {
    /**
     * @override
     * @return {!Array<!WebInspector.ToolbarItem>}
     */
    syncToolbarItems: function()
    {
        return [this._mimeTypeLabel];
    },

    /**
     * @param {string} uniqueFontName
     * @param {?string} content
     */
    _onFontContentLoaded: function(uniqueFontName, content)
    {
        var url = content ? WebInspector.Resource.contentAsDataURL(content, this._mimeType, true) : this._url;
        this.fontStyleElement.textContent = String.sprintf("@font-face { font-family: \"%s\"; src: url(%s); }", uniqueFontName, url);
    },

    _createContentIfNeeded: function()
    {
        if (this.fontPreviewElement)
            return;

        var uniqueFontName = "WebInspectorFontPreview" + (++WebInspector.FontView._fontId);

        this.fontStyleElement = createElement("style");
        this._contentProvider.requestContent().then(this._onFontContentLoaded.bind(this, uniqueFontName));
        this.element.appendChild(this.fontStyleElement);

        var fontPreview = createElement("div");
        for (var i = 0; i < WebInspector.FontView._fontPreviewLines.length; ++i) {
            if (i > 0)
                fontPreview.createChild("br");
            fontPreview.createTextChild(WebInspector.FontView._fontPreviewLines[i]);
        }
        this.fontPreviewElement = fontPreview.cloneNode(true);
        this.fontPreviewElement.style.setProperty("font-family", uniqueFontName);
        this.fontPreviewElement.style.setProperty("visibility", "hidden");

        this._dummyElement = fontPreview;
        this._dummyElement.style.visibility = "hidden";
        this._dummyElement.style.zIndex = "-1";
        this._dummyElement.style.display = "inline";
        this._dummyElement.style.position = "absolute";
        this._dummyElement.style.setProperty("font-family", uniqueFontName);
        this._dummyElement.style.setProperty("font-size", WebInspector.FontView._measureFontSize + "px");

        this.element.appendChild(this.fontPreviewElement);
    },

    wasShown: function()
    {
        this._createContentIfNeeded();

        this.updateFontPreviewSize();
    },

    onResize: function()
    {
        if (this._inResize)
            return;

        this._inResize = true;
        try {
            this.updateFontPreviewSize();
        } finally {
            delete this._inResize;
        }
    },

    _measureElement: function()
    {
        this.element.appendChild(this._dummyElement);
        var result = { width: this._dummyElement.offsetWidth, height: this._dummyElement.offsetHeight };
        this.element.removeChild(this._dummyElement);

        return result;
    },

    updateFontPreviewSize: function()
    {
        if (!this.fontPreviewElement || !this.isShowing())
            return;

        this.fontPreviewElement.style.removeProperty("visibility");
        var dimension = this._measureElement();

        const height = dimension.height;
        const width = dimension.width;

        // Subtract some padding. This should match the paddings in the CSS plus room for the scrollbar.
        const containerWidth = this.element.offsetWidth - 50;
        const containerHeight = this.element.offsetHeight - 30;

        if (!height || !width || !containerWidth || !containerHeight) {
            this.fontPreviewElement.style.removeProperty("font-size");
            return;
        }

        var widthRatio = containerWidth / width;
        var heightRatio = containerHeight / height;
        var finalFontSize = Math.floor(WebInspector.FontView._measureFontSize * Math.min(widthRatio, heightRatio)) - 2;

        this.fontPreviewElement.style.setProperty("font-size", finalFontSize + "px", null);
    },

    __proto__: WebInspector.SimpleView.prototype
}
