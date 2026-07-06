# URL matching with @-moz-document

`@-moz-document` rules tell Stylem which pages a style should apply to. You
can manage these visually through the editor's **Applies To** section, or
write them directly in the CSS.

## Rule types

### domain

Matches all pages on a domain and its subdomains. Do not include protocol,
port, or wildcards.

**Valid:**
```css
@-moz-document domain(example.com)
@-moz-document domain(www.example.com)
```

**Invalid:**
```css
@-moz-document domain(*.example.com)
@-moz-document domain(http://www.example.com/)
@-moz-document domain(example.com:80)
```

### url

Matches an exact URL, including the protocol. Wildcards are not permitted.

**Valid:**
```css
@-moz-document url(http://www.example.com/page.html)
```

**Invalid:**
```css
@-moz-document url(www.example.com/page.html)
@-moz-document url(http://www.example.com/*)
```

### url-prefix

Matches any URL that starts with the given string, including protocol.
Wildcards are not permitted.

**Valid:**
```css
@-moz-document url-prefix(http://www.example.com/)
@-moz-document url-prefix(http://www.example.)
@-moz-document url-prefix(http:)
```

**Invalid:**
```css
@-moz-document url-prefix(www.example.com/page.html)
@-moz-document url-prefix(http://*.example.com/)
```

### regexp

Matches URLs against a regular expression. The expression must match the
entire URL (so `^` and `$` anchors are unnecessary). Must be enclosed in
quotes. Backslashes must be double-escaped per CSS rules (e.g. `\\.` to match
a literal period).

**Valid:**
```css
@-moz-document regexp("http://(www|blog)\\.example\\.com/.*")
```

## Multiple conditions

Combine multiple conditions in a single `@-moz-document` block with commas:

```css
@-moz-document domain("images.example.com"), url-prefix("http://example.com/images") {
    /* applies to both conditions */
}
```

## Common pitfalls

- `http://www.example.com` and `https://www.example.com` are different URLs.
  Use `url-prefix` to cover both, or list both explicitly.
- A `domain` rule does not require a protocol - just the domain name.
- `url-prefix(http://example.com)` does not cover `https://example.com`.

## Advanced regexp matching

Regular expressions offer powerful URL matching when the simpler rule types
won't do. Escaping follows two layers: CSS string escaping first, then regex
escaping inside that.

**Wildcard in the middle of a URL:**
```css
@-moz-document regexp("http://www\\.example\\.(com|de)/images/.*")
```

**Match all sites except one:**
```css
@-moz-document regexp("(?!http://www\\.example\\.com).*")
```

**Match all except a specific path:**
```css
@-moz-document regexp("http://www\\.example\\.com/(?!members).*")
```

## Style types

Based on the rules, Stylem classifies styles into three types:

- **App** - targets browser chrome (`@namespace` is XUL, or rules use
  `chrome:`, `about:`, or `x-jsd:` protocols)
- **Global** - applies everywhere (no `@-moz-document` rules, or uses
  `url-prefix` covering entire protocols like `http:`)
- **Site** - restricted to specific domains or URLs
