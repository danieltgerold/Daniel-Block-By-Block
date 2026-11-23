package blockbyblock.core.chat;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Port of PlayerDirectory in src/chat.js: who is online and under what name. Display names are never ids, and joining
 * and renaming use the same case-insensitive uniqueness rule.
 */
public final class PlayerDirectory {
    public static final class Player {
        public final String id;
        private String displayName;

        Player(String id, String displayName) {
            this.id = id;
            this.displayName = displayName;
        }

        public String displayName() { return displayName; }
    }

    /** Outcome of joining or renaming: the player, or the reason it failed. */
    public static final class Result {
        public final boolean ok;
        public final Player player;
        public final String error;

        private Result(boolean ok, Player player, String error) {
            this.ok = ok;
            this.player = player;
            this.error = error;
        }
    }

    private final Map<String, Player> players = new LinkedHashMap<>(); // join order is observable

    public Iterable<Player> players() { return players.values(); }

    private static Result fail(String error) { return new Result(false, null, error); }

    private static Result ok(Player player) { return new Result(true, player, null); }

    /** True when no other player (optionally ignoring one id) has this name in any capitalisation, and it is not "server". */
    public boolean available(String name, String exceptId) {
        String key = PlayerNames.canonical(name);
        if (key.equals("server")) return false;
        for (Player p : players.values()) {
            if (!p.id.equals(exceptId) && PlayerNames.canonical(p.displayName).equals(key)) return false;
        }
        return true;
    }

    /** The first free {@code playerN}. */
    public String nextDefaultName() {
        int number = 1;
        // At most one candidate per player already online, plus one.
        while (!available("player" + number, null)) number++;
        return "player" + number;
    }

    /** Adds a player under a preferred name (or the next default); a returning id gets its existing entry. */
    public Result join(String id, String preferredName) {
        if (id == null || id.isEmpty() || id.equals(PlayerNames.SERVER_ID)) return fail("Invalid player identity.");
        if (players.containsKey(id)) return ok(players.get(id));
        PlayerNames.Result validated = PlayerNames.validate(preferredName != null ? preferredName : nextDefaultName());
        if (!validated.ok) return fail(validated.error);
        if (!available(validated.name, null)) return fail("That name is already in use.");
        Player player = new Player(id, validated.name);
        players.put(id, player);
        return ok(player);
    }

    public Result rename(String id, String value) {
        PlayerNames.Result validated = PlayerNames.validate(value);
        if (!validated.ok) return fail(validated.error);
        Player player = players.get(id);
        if (player == null) return fail("Unknown player identity.");
        if (!available(validated.name, id)) return fail("That name is already in use.");
        player.displayName = validated.name;
        return ok(player);
    }
}
