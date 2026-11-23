package blockbyblock.core.text;

/** String helpers with JavaScript's definitions, which differ from Java's (whitespace and trimming in particular). */
public final class JsText {
    private JsText() {}

    /**
     * True for the characters a JS regular expression's backslash-s and String.prototype.trim treat as whitespace:
     * tab, line feed, vertical tab, form feed, carriage return, space, no-break space (0xA0), Ogham space (0x1680),
     * 0x2000 to 0x200A, line and paragraph separators (0x2028, 0x2029), 0x202F, 0x205F, 0x3000 and the byte order
     * mark (0xFEFF). Not included: 0x85 and 0x180E, which Java and older JS engines count.
     */
    public static boolean isSpace(char c) {
        switch (c) {
            case 0x09: case 0x0A: case 0x0B: case 0x0C: case 0x0D: case 0x20: case 0xA0: case 0x1680:
            case 0x2028: case 0x2029: case 0x202F: case 0x205F: case 0x3000: case 0xFEFF:
                return true;
            default:
                return c >= 0x2000 && c <= 0x200A;
        }
    }

    public static boolean hasSpace(String s) {
        for (int i = 0; i < s.length(); i++) if (isSpace(s.charAt(i))) return true;
        return false;
    }

    /** JS String.prototype.trim. */
    public static String trim(String s) {
        int start = 0, end = s.length();
        while (start < end && isSpace(s.charAt(start))) start++;
        while (end > start && isSpace(s.charAt(end - 1))) end--;
        return s.substring(start, end);
    }
}
