package blockbyblock.core.chat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Just enough JSON to read the golden TSV cells: strings, null, numbers, arrays and empty objects. */
final class MiniJson {
    private final String text;
    private int pos;

    private MiniJson(String text) { this.text = text; }

    static Object parse(String text) {
        MiniJson parser = new MiniJson(text);
        Object value = parser.value();
        if (parser.pos != text.length()) throw new IllegalArgumentException("Trailing JSON: " + text);
        return value;
    }

    private Object value() {
        char c = text.charAt(pos);
        if (c == '"') return string();
        if (c == '[') {
            pos++;
            List<Object> list = new ArrayList<>();
            if (text.charAt(pos) == ']') { pos++; return list; }
            while (true) {
                list.add(value());
                if (text.charAt(pos++) == ']') return list;
            }
        }
        if (c == '{') {
            pos++;
            Map<String, Object> map = new LinkedHashMap<>();
            if (text.charAt(pos) == '}') { pos++; return map; }
            throw new IllegalArgumentException("Non-empty objects are not needed");
        }
        if (text.startsWith("null", pos)) { pos += 4; return null; }
        int start = pos;
        while (pos < text.length() && "+-.eE0123456789".indexOf(text.charAt(pos)) >= 0) pos++;
        return Double.valueOf(text.substring(start, pos));
    }

    private String string() {
        StringBuilder out = new StringBuilder();
        pos++;
        while (true) {
            char c = text.charAt(pos++);
            if (c == '"') return out.toString();
            if (c != '\\') { out.append(c); continue; }
            char e = text.charAt(pos++);
            switch (e) {
                case 'n': out.append('\n'); break;
                case 't': out.append('\t'); break;
                case 'r': out.append('\r'); break;
                case 'b': out.append('\b'); break;
                case 'f': out.append('\f'); break;
                case 'u': out.append((char) Integer.parseInt(text.substring(pos, pos + 4), 16)); pos += 4; break;
                default: out.append(e);
            }
        }
    }
}
