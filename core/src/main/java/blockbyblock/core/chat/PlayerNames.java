package blockbyblock.core.chat;

import blockbyblock.core.text.JsText;
import java.util.Locale;

/** Player-name rules, ported from validateName and canonicalName in src/chat.js. */
public final class PlayerNames {
    private PlayerNames() {}

    /** The id the server's own messages carry; no player can use it. */
    public static final String SERVER_ID = "system:server";
    public static final int MAX_LENGTH = 16;

    /** Outcome of a name check: the accepted name, or the reason it was refused. */
    public static final class Result {
        public final boolean ok;
        public final String name;
        public final String error;

        private Result(boolean ok, String name, String error) {
            this.ok = ok;
            this.name = name;
            this.error = error;
        }

        static Result ok(String name) { return new Result(true, name, null); }

        static Result error(String message) { return new Result(false, null, message); }
    }

    public static String canonical(String value) { return JsText.trim(value).toLowerCase(Locale.ROOT); }

    /** Checks a name; anything that is not text (null here) counts as blank. */
    public static Result validate(String value) {
        String name = value == null ? "" : JsText.trim(value);
        if (name.isEmpty()) return Result.error("Enter a name; it cannot be blank.");
        if (JsText.hasSpace(value)) return Result.error("Spaces are not allowed in player names.");
        if (name.length() > MAX_LENGTH) return Result.error("Names must be 16 characters or fewer.");
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            boolean letterOrDigit = c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9';
            if (!letterOrDigit) return Result.error("Use only letters and numbers.");
        }
        if (canonical(name).equals("server")) return Result.error("The name server is reserved for system messages.");
        return Result.ok(name);
    }
}
