package blockbyblock.core.chat;

import blockbyblock.core.item.ItemDefinition;
import blockbyblock.core.text.JsNumbers;
import blockbyblock.core.text.JsText;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The chat command registry, ported from src/chat-commands.js: parsing, validation, help, Tab completion and the
 * replies. One table drives all of it. Number and coordinate syntax is parsed by hand to the same grammar as the
 * JS regular expressions, because regex dialects differ at the edges.
 */
public final class Commands {
    private Commands() {}

    /** One entry of the command table. Setting commands have a setting name; others have an action. */
    static final class Command {
        final String name, setting, label, unit, action, usage, description;
        final double min, max;

        Command(String name, String setting, String label, String unit, double min, double max, String action, String usage, String description) {
            this.name = name;
            this.setting = setting;
            this.label = label;
            this.unit = unit;
            this.min = min;
            this.max = max;
            this.action = action;
            this.usage = usage;
            this.description = description;
        }

        static Command setting(String name, String setting, String label, String unit, double min, double max, String description) {
            return new Command(name, setting, label, unit, min, max, null, null, description);
        }

        static Command action(String name, String action, String usage, String description) {
            return new Command(name, null, null, null, 0, 0, action, usage, description);
        }
    }

    static final Command[] COMMANDS = {
        Command.action("/help", null, null, "Show commands"),
        Command.setting("/speed", "speed", "Walking speed", "blocks/s", 0, 255, "walking speed at size 1"),
        Command.setting("/reach", "reach", "Reach", "blocks", 0, 255, "eye-to-hit interaction distance at size 1"),
        Command.setting("/jump", "jump", "Jump apex", "blocks", 0, 255, "jump apex above takeoff at size 1"),
        Command.setting("/size", "size", "Size", "multiplier", 0.1, 4, "player size multiplier"),
        Command.setting("/falldamage", "falldamage", "Fall damage", "multiplier", 0, 255, "Fall damage multiplier"),
        Command.action("/default", "defaults", null, "Reset all player settings"),
        Command.action("/tp", "teleport", "/tp <x> <y> <z>", "Teleport feet (~ for relative)"),
        Command.action("/give", "give", "/give <item> [quantity]", "Give items"),
        Command.action("/gamemode", "gamemode", "/gamemode <mode>", "Survival / Creative"),
        Command.action("/devmode", "developer", null, "Enable developer mode"),
    };

    /** The dash the help text uses between a command and its description (U+2014). */
    private static final char EM_DASH = (char) 0x2014;

    private static String settingLabel(String setting) {
        switch (setting) {
            case "speed": return "Walking speed";
            case "reach": return "Interaction distance";
            case "jump": return "Jump height";
            case "size": return "Player size";
            default: return "Fall damage multiplier";
        }
    }

    public static String help() {
        StringBuilder text = new StringBuilder("Commands");
        for (Command c : COMMANDS) {
            text.append('\n');
            if (c.setting != null) text.append(c.name).append(" <value> ").append(EM_DASH).append(" ").append(settingLabel(c.setting));
            else text.append(c.usage != null ? c.usage : c.name).append(" ").append(EM_DASH).append(" ").append(c.description);
        }
        return text.append("\nUse default in place of a value to reset that setting.").toString();
    }

    // ---- JS grammar by hand -------------------------------------------------------------------------------

    private static boolean digit(String s, int i) { return i < s.length() && s.charAt(i) >= '0' && s.charAt(i) <= '9'; }

    /**
     * End of the longest number at {@code i} per {@code [+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?} (case-insensitive),
     * or -1. Greedy matching is enough: a shorter match leaves a character that cannot continue any caller's pattern.
     */
    static int numberEnd(String s, int i) {
        int p = i;
        if (p < s.length() && (s.charAt(p) == '+' || s.charAt(p) == '-')) p++;
        if (digit(s, p)) {
            while (digit(s, p)) p++;
            if (p < s.length() && s.charAt(p) == '.') {
                p++;
                while (digit(s, p)) p++;
            }
        } else if (p < s.length() && s.charAt(p) == '.' && digit(s, p + 1)) {
            p++;
            while (digit(s, p)) p++;
        } else return -1;
        if (p < s.length() && (s.charAt(p) == 'e' || s.charAt(p) == 'E')) {
            int q = p + 1;
            if (q < s.length() && (s.charAt(q) == '+' || s.charAt(q) == '-')) q++;
            if (digit(s, q)) {
                while (digit(s, q)) q++;
                p = q;
            }
        }
        return p;
    }

    /** End of a coordinate at {@code i}: a number, or {@code ~} optionally followed by a number; -1 if neither. */
    private static int coordinateEnd(String s, int i) {
        if (i < s.length() && s.charAt(i) == '~') {
            int end = numberEnd(s, i + 1);
            return end < 0 ? i + 1 : end;
        }
        return numberEnd(s, i);
    }

    private static int skipSpace(String s, int i) {
        while (i < s.length() && JsText.isSpace(s.charAt(i))) i++;
        return i;
    }

    /** Three coordinates separated by whitespace or by commas (not mixed), covering the whole text; null if not. */
    static String[] coordinates(String s) {
        for (boolean commas : new boolean[] {false, true}) {
            String[] found = new String[3];
            int p = 0;
            boolean ok = true;
            for (int n = 0; n < 3 && ok; n++) {
                int end = coordinateEnd(s, p);
                if (end < 0) { ok = false; break; }
                found[n] = s.substring(p, end);
                p = end;
                if (n == 2) break;
                int q = skipSpace(s, p);
                if (commas) {
                    if (q >= s.length() || s.charAt(q) != ',') { ok = false; break; }
                    p = skipSpace(s, q + 1);
                } else {
                    if (q == p) { ok = false; break; }
                    p = q;
                }
            }
            if (ok && p == s.length()) return found;
        }
        return null;
    }

    private static boolean isNumber(String s) { return numberEnd(s, 0) == s.length(); }

    /** JS {@code text.split(/\s+/)}: runs of whitespace separate tokens; leading and trailing runs leave empty strings. */
    static List<String> split(String text) {
        List<String> parts = new ArrayList<>();
        int start = 0, i = 0;
        while (i < text.length()) {
            if (JsText.isSpace(text.charAt(i))) {
                parts.add(text.substring(start, i));
                while (i < text.length() && JsText.isSpace(text.charAt(i))) i++;
                start = i;
            } else i++;
        }
        parts.add(text.substring(start));
        return parts;
    }

    private static boolean lineTerminator(char c) { return c == '\n' || c == '\r' || c == 0x2028 || c == 0x2029; }

    // ---- Completion ---------------------------------------------------------------------------------------

    /** Tab completions for a half-typed command, in the order the JS lists them. */
    public static List<String> completions(String text) {
        List<String> none = new ArrayList<>();
        if (!text.startsWith("/")) return none;
        int p = 1;
        while (p < text.length() && !JsText.isSpace(text.charAt(p))) p++;
        String prefix = text.substring(1, p);
        int sepEnd = skipSpace(text, p);
        boolean separator = sepEnd > p;
        String argument = text.substring(sepEnd);
        for (int i = 0; i < argument.length(); i++) if (lineTerminator(argument.charAt(i))) return none;
        String lower = prefix.toLowerCase(Locale.ROOT);
        List<String> result = new ArrayList<>();
        if (!separator) {
            for (Command c : COMMANDS) if (c.name.startsWith("/" + lower)) result.add(c.name + " ");
            return result;
        }
        Command command = find("/" + lower);
        String argLower = argument.toLowerCase(Locale.ROOT);
        if (command != null && "gamemode".equals(command.action)) {
            for (String mode : new String[] {"survival", "creative"}) if (mode.startsWith(argLower)) result.add("/gamemode " + mode);
            return result;
        }
        if (command != null && "teleport".equals(command.action)) {
            if ("~ ~ ~".startsWith(argument)) result.add("/tp ~ ~ ~");
            return result;
        }
        if (command != null && "give".equals(command.action)) {
            if (JsText.hasSpace(argument)) return result;
            for (ItemDefinition item : ItemDefinition.all()) if (item.id.startsWith(argLower)) result.add("/give " + item.id + " ");
            return result;
        }
        if (command == null || command.setting == null || JsText.hasSpace(argument)) return result;
        if ("default".startsWith(argLower)) result.add(command.name + " default");
        return result;
    }

    private static Command find(String name) {
        for (Command c : COMMANDS) if (c.name.equals(name)) return c;
        return null;
    }

    // ---- Running a command --------------------------------------------------------------------------------

    private static boolean wholeNumber(String s) {
        if (s.isEmpty()) return false;
        int i = s.charAt(0) == '+' ? 1 : 0;
        if (i >= s.length()) return false;
        for (; i < s.length(); i++) if (!digit(s, i)) return false;
        return true;
    }

    /** Runs a typed command (starting with a slash) for the service's player and replies with the outcome. */
    public static void apply(ChatService service, String text) {
        List<String> parts = split(text);
        String name = parts.get(0);
        List<String> args = parts.subList(1, parts.size());
        Command command = find(name.toLowerCase(Locale.ROOT));
        CommandPlayer player = service.controller();
        if (command == null) { service.reply("Unknown command. Type /help for available commands."); return; }
        if ("developer".equals(command.action)) {
            if (!args.isEmpty()) { service.reply("Usage: /devmode"); return; }
            service.reply(player.enableDeveloperMode() ? "You have entered developer mode." : "Developer mode is already enabled.");
            return;
        }
        if ("gamemode".equals(command.action)) {
            if (args.size() != 1 || !player.setGameMode(args.get(0).toLowerCase(Locale.ROOT))) {
                service.reply("Use /gamemode survival or /gamemode creative.");
                return;
            }
            service.reply("Game mode set to " + (player.gameMode().equals("creative") ? "Creative" : "Survival") + ".");
            return;
        }
        if ("give".equals(command.action)) { give(service, player, args); return; }
        if ("teleport".equals(command.action)) { teleport(service, player, command, text, name); return; }
        if (command.setting == null) {
            if (!args.isEmpty()) service.reply("Usage: " + command.name + ". See /help for commands.");
            else if ("defaults".equals(command.action)) {
                CommandPlayer.Result result = player.resetAllSettings();
                service.reply(result.ok ? "Speed, reach, jump height, size, and fall damage reset to default." : result.error);
            } else service.reply(help());
            return;
        }
        setting(service, player, command, args);
    }

    private static void give(ChatService service, CommandPlayer player, List<String> args) {
        if (args.isEmpty() || !ItemDefinition.exists(args.get(0))) {
            service.reply("Unknown item ID. Use /give <item> [quantity]; Tab lists matching IDs.");
            return;
        }
        BigInteger amount = BigInteger.ONE;
        boolean bad = args.size() > 2;
        if (!bad && args.size() == 2) {
            if (!wholeNumber(args.get(1))) bad = true;
            else amount = new BigInteger(args.get(1));
        }
        if (bad || amount.signum() <= 0) {
            service.reply("Quantity must be a positive whole number. Use /give <item> [quantity].");
            return;
        }
        player.giveItem(args.get(0), amount);
        service.reply("Gave " + amount + " " + ItemDefinition.forId(args.get(0)).name + ".");
    }

    private static void teleport(ChatService service, CommandPlayer player, Command command, String text, String name) {
        String[] tokens = coordinates(JsText.trim(text.substring(name.length())));
        double[] origin = {player.x, player.y, player.z};
        double[] coords = new double[3];
        boolean ok = tokens != null;
        for (int i = 0; ok && i < 3; i++) {
            String token = tokens[i];
            if (token.startsWith("~")) {
                String rest = token.substring(1);
                coords[i] = origin[i] + (rest.isEmpty() ? 0 : Double.parseDouble(rest));
            } else coords[i] = Double.parseDouble(token);
            ok = !Double.isNaN(coords[i]) && !Double.isInfinite(coords[i]);
        }
        if (!ok) { service.reply("Usage: " + command.usage); return; }
        player.teleport(coords[0], coords[1], coords[2]);
        service.reply("Teleported to " + JsNumbers.toString(coords[0]) + ", " + JsNumbers.toString(coords[1]) + ", " + JsNumbers.toString(coords[2]) + ".");
    }

    private static void setting(ChatService service, CommandPlayer player, Command command, List<String> args) {
        boolean reset = args.size() == 1 && args.get(0).toLowerCase(Locale.ROOT).equals("default");
        boolean numeric = args.size() == 1 && isNumber(args.get(0));
        double value = reset ? (command.setting.equals("reach") ? player.defaultReach() : CommandPlayer.defaultSetting(command.setting))
            : numeric ? Double.parseDouble(args.get(0)) : Double.NaN;
        boolean developer = player.developerMode;
        boolean finite = !Double.isNaN(value) && !Double.isInfinite(value);
        boolean inRange = developer ? (command.setting.equals("size") ? value > 0 : value >= 0) : value >= command.min && value <= command.max;
        if (args.size() != 1 || (!reset && !numeric) || !finite || !inRange) {
            service.reply(developer
                ? command.name + " must be a finite " + (command.setting.equals("size") ? "positive" : "nonnegative") + " number. See /help."
                : command.name + " must be between " + JsNumbers.toString(command.min) + " and " + JsNumbers.toString(command.max) + ". See /help.");
            return;
        }
        CommandPlayer.Result result = player.configure(command.setting, value);
        if (!result.ok) { service.reply(result.error); return; }
        StringBuilder reply = new StringBuilder(command.label).append(' ').append(reset ? "reset to default" : "set to").append(' ')
            .append(JsNumbers.numberText(value)).append(' ').append(command.unit).append('.');
        if (command.setting.equals("size")) {
            reply.append(" Effective speed ").append(JsNumbers.numberText(result.effectiveSpeed)).append(" blocks/s, reach ")
                .append(JsNumbers.numberText(result.effectiveReach)).append(" blocks, jump ").append(JsNumbers.numberText(result.effectiveJump)).append(" blocks.");
        } else if (!command.setting.equals("falldamage") && player.size != 1) {
            reply.append(" Effective ").append(JsNumbers.numberText(result.effective(command.setting))).append(' ').append(command.unit)
                .append(" at size ").append(JsNumbers.numberText(player.size)).append('.');
        }
        service.reply(reply.toString());
    }
}
