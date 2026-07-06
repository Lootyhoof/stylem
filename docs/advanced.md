# Advanced techniques

## Overwriting page styles

User styles need to override existing CSS on the page. Which rule wins when
multiple rules target the same property is determined by the
[CSS cascade](http://www.w3.org/TR/2011/REC-CSS2-20110607/cascade.html#cascading-order).

### !important

The most reliable approach is adding `!important` to your declarations:

```css
a {
    text-decoration: none !important;
}
```

### Specificity

When two rules have the same importance, the one with the higher
[specificity](http://www.w3.org/TR/2011/REC-CSS2-20110607/cascade.html#specificity)
wins. You can increase specificity by writing longer selectors:

```css
/* Instead of: */
#bar { color: red !important; }

/* Use a more specific selector: */
#foo #bar { color: red !important; }
/* or: */
div#bar { color: red !important; }
```

### AGENT_SHEET

Include `/* AGENT_SHEET */` anywhere in your style to make it apply as an
agent sheet. This lets you style
[anonymous content](https://developer.mozilla.org/en-US/docs/XBL/XBL_1.0_Reference/Anonymous_Content)
such as scrollbars and the internal parts of `<input type="file">`.

**This comment only works in Stylem. Agent sheets can crash your browser -
only use this mode when necessary.**

## Replacing images in &lt;img&gt; tags

Replacing `<img>` elements requires a CSS trick since you cannot change the
`src` attribute with CSS alone:

```css
#your-selector-here {
    height: 0 !important;
    width: 0 !important;
    /* these numbers match the new image's dimensions */
    padding-left: 125px !important;
    padding-top: 25px !important;
    background: url(http://example.com/your/image/here) no-repeat !important;
}
```

## Selecting specific elements

User styles use standard [CSS selectors](http://www.w3.org/TR/selectors/) to
target elements. Since you cannot modify the page's HTML, you may need
creative strategies:

- **Combinators** - start from an element that has an ID or class and navigate
  to the target:
  ```css
  #prices td:nth-child(2) { text-align: right !important; }
  ```
- **Attribute selectors** - match elements by their attributes:
  ```css
  .container p[style*="float: right"] { display: none !important; }
  ```
- **Structural pseudo-classes** - select by position in the document:
  ```css
  .container p:first-child { font-weight: bold !important; }
  ```

### DOM Inspector tool

If you have [DOM Inspector](https://addons.palemoon.org/addon/dom-inspector/)
installed, Stylem adds a **Copy Selector** menu to the right-click context
menu. Open DOM Inspector, right-click a node in the left pane, and choose a
suggested selector.

### Selector Gadget

The [Selector Gadget](http://selectorgadget.com/) bookmarklet can help
generate selectors interactively. Click elements you want to select, then
elements you want to exclude, and it will suggest the simplest matching
selector.
