"""
Utility functions for contest exporters.
Includes markdown helpers, filename sanitization, and code highlighting.
"""
import markdown
import re


def inline_markdown(text: str) -> str:
    """
    Parse inline markdown (bold, italic, code) and return HTML without block-level wrappers.
    Useful for titles and single-line text that should support formatting.
    """
    if not text:
        return ""
    # Parse markdown
    html = markdown.markdown(text, extensions=['extra'])
    # Remove paragraph tags for inline use
    html = re.sub(r'^<p>(.*)</p>$', r'\1', html.strip(), flags=re.DOTALL)
    return html


def preprocess_markdown_html(text: str) -> str:
    """
    Preprocess markdown text to add 'markdown=1' attribute to HTML block tags.
    This enables markdown parsing inside HTML blocks when using md_in_html extension.
    """
    if not text:
        return ""
    # Add markdown="1" to common block-level HTML tags that should allow markdown inside
    # Match opening tags like <aside>, <div>, <section> etc. and add markdown="1"
    html_block_tags = ['aside', 'div', 'section', 'article', 'blockquote', 'details', 'summary']
    for tag in html_block_tags:
        # Replace <tag> with <tag markdown="1"> (only if no markdown attr already)
        text = re.sub(
            rf'<({tag})(\s*)>',
            rf'<\1 markdown="1">',
            text,
            flags=re.IGNORECASE
        )
        # Also handle tags with existing attributes
        text = re.sub(
            rf'<({tag})\s+(?!markdown=)([\w\s="\']+)>',
            rf'<\1 markdown="1" \2>',
            text,
            flags=re.IGNORECASE
        )
    return text


def ensure_markdown_lists(text: str) -> str:
    """
    Ensure that list items (starting with - or *) are preceded by a blank line.
    This fixes issues where lists are rendered as inline text.
    """
    if not text:
        return ""
    # Look for non-empty line followed immediately by a list item on the next line
    return re.sub(r'([^\n])\n(\s*[\-\*]\s+)', r'\1\n\n\2', text)


def render_markdown(text: str, *, soft_breaks: bool = True) -> str:
    """
    Full markdown rendering with proper handling of HTML blocks.
    """
    if not text:
        return ""
    # Ensure lists are preceded by blank lines
    text = ensure_markdown_lists(text)
    # Preprocess to enable markdown inside HTML blocks
    text = preprocess_markdown_html(text)
    # Render with all necessary extensions
    extensions = ['extra', 'tables', 'sane_lists', 'md_in_html', 'codehilite']
    if soft_breaks:
        extensions.append('nl2br')
    return markdown.markdown(
        text,
        extensions=extensions,
        extension_configs={
            'codehilite': {
                'guess_lang': False,
                'noclasses': True,
            }
        }
    )


def sanitize_filename(filename: str) -> str:
    """
    Sanitize a string to be safe for use as a filename.
    Removes or replaces characters that are not allowed in filenames.
    """
    # Remove or replace invalid characters
    filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', filename)
    # Remove leading/trailing dots and spaces
    filename = filename.strip('. ')
    # Limit length
    if len(filename) > 200:
        filename = filename[:200]
    # Ensure not empty
    if not filename:
        filename = 'contest'
    return filename


def highlight_code(code: str, language: str = 'cpp') -> str:
    """
    Apply syntax highlighting to code using Pygments with Carbon-style theme.
    Returns HTML string with highlighted code.
    """
    try:
        from pygments import highlight
        from pygments.lexers import get_lexer_by_name, TextLexer
        from pygments.formatters import HtmlFormatter

        # Strip leading/trailing empty lines but preserve internal formatting
        code_lines = code.split('\n')
        # Remove leading empty lines
        while code_lines and not code_lines[0].strip():
            code_lines.pop(0)
        # Remove trailing empty lines
        while code_lines and not code_lines[-1].strip():
            code_lines.pop()
        code = '\n'.join(code_lines)

        # Map submission language to Pygments lexer
        lexer_map = {
            'cpp': 'cpp',
            'c': 'c',
            'python': 'python3',
            'java': 'java',
        }
        lexer_name = lexer_map.get(language, 'text')

        try:
            lexer = get_lexer_by_name(lexer_name)
        except Exception:
            lexer = TextLexer()

        # Custom Carbon-style formatter - use inline line numbers for compact display
        formatter = HtmlFormatter(
            style='default',
            noclasses=True,
            linenos='inline',  # Inline line numbers instead of table
            linenostart=1,
            nowrap=False,
        )

        highlighted = highlight(code, lexer, formatter)
        return highlighted
    except ImportError:
        # Fallback if Pygments not available
        import html
        return f'<pre><code>{html.escape(code)}</code></pre>'


def get_carbon_code_styles(scale: float = 1.0) -> str:
    """
    Get Carbon Design System inspired styles for code highlighting.

    Args:
        scale: Scale multiplier for font sizes

    Returns:
        CSS string for code highlighting
    """
    return f'''
        .highlight {{
            background-color: #f4f4f4;
            border: 1px solid #e0e0e0;
            border-radius: {4 * scale}px;
            padding: {12 * scale}px;
            margin: {8 * scale}px 0 {16 * scale}px 0;
            overflow-x: auto;
            font-family: "IBM Plex Mono", "SF Mono", monospace;
            font-size: {12 * scale}px;
            line-height: 1.5;
        }}
        .highlight pre {{
            margin: 0;
            padding: 0;
            background: transparent;
            border: none;
            white-space: pre-wrap;
            word-wrap: break-word;
        }}
    '''
