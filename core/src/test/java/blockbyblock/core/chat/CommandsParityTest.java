package blockbyblock.core.chat;

import static blockbyblock.core.golden.GoldenCsv.num;
import static blockbyblock.core.golden.GoldenCsv.sameBits;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.world.VoxelWorld;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Replays every recorded chat input against the real JS behaviour: replies, messages, settings and side effects. */
class CommandsParityTest {
    /** The jump-velocity search from src/player-settings.js, using StrictMath (test code only; the core must not). */
    static double jumpApex(double velocity) {
        if (velocity <= 0.08) return Math.max(0, velocity);
        double drag = 0.98, terminal = 0.08 * drag / (1 - drag);
        double ticks = Math.ceil(StrictMath.log(terminal / (velocity + terminal)) / StrictMath.log(drag));
        double sum = (1 - StrictMath.pow(drag, ticks)) / (1 - drag);
        return sum * velocity - terminal * (ticks - sum);
    }

    static double jumpVelocityForHeight(double height) {
        if (height == 0) return 0;
        if (height == CommandPlayer.DEFAULT_JUMP) return 0.42;
        double low = 0, high = height;
        for (int i = 0; i < 100; i++) {
            double middle = low + (high - low) * 0.5;
            if (jumpApex(middle) < height) low = middle; else high = middle;
        }
        return low + (high - low) * 0.5;
    }

    private static final class Run implements CommandPlayer.Host {
        final VoxelWorld world = new VoxelWorld(0, new String[] {"bedrock", "dirt", "dirt", "grass.block"});
        final List<String> gives = new ArrayList<>();
        final List<double[]> teleports = new ArrayList<>();
        final List<Integer> broadcasts = new ArrayList<>();
        final List<ChatService.Message> delivered = new ArrayList<>();
        final CommandPlayer player = new CommandPlayer(this);
        final ChatService service;

        Run() {
            world.setBlock(0, 6, 0, "stone", null, 0, false);
            player.teleport(0.5, 4, 0.5);
            teleports.clear();
            service = new ChatService("p1", "player1", player, message -> broadcasts.add(message.id));
            service.subscribe(delivered::add);
        }

        @Override public double jumpVelocityForHeight(double height) { return CommandsParityTest.jumpVelocityForHeight(height); }

        @Override public boolean intersectsPlayer(double x, double y, double z, double size) { return world.intersectsPlayer(x, y, z, .3 * size, 1.8 * size); }

        @Override public void giveItem(String id, BigInteger amount) { gives.add(id + ":" + amount); }

        @Override public void teleported(double x, double y, double z) { teleports.add(new double[] {x, y, z}); }
    }

    @SuppressWarnings("unchecked")
    private static Object apply(Run run, List<Object> op) {
        String name = (String) op.get(0);
        switch (name) {
            case "submit": return run.service.submit((String) op.get(1));
            case "completions": return run.service.completions((String) op.get(1));
            case "configure": {
                List<Object> args = (List<Object>) op.get(1);
                CommandPlayer.Result r = run.player.configure((String) args.get(0), Double.parseDouble(((String) args.get(1)).replace("Infinity", "Infinity")));
                return r.ok ? "ok" : r.error;
            }
            case "deliver": {
                List<Object> args = (List<Object>) op.get(1);
                Map<String, Object> draft = (Map<String, Object>) args.get(0);
                return run.service.deliver((String) draft.get("senderId"), (String) draft.get("senderName"), (String) draft.get("text"),
                    (String) draft.get("kind"), (String) draft.get("recipientId"), (Boolean) args.get(1));
            }
            default: throw new IllegalArgumentException(name);
        }
    }

    @SuppressWarnings("unchecked")
    @Test void chatInputMatchesJsAfterEveryStep() throws Exception {
        String seed = "";
        Run run = null;
        for (String[] r : PlayerNamesParityTest.tsv("commands.tsv", "seed\tstep\top\tret\tdelivered\tstate", 1189)) {
            if (!r[0].equals(seed)) { seed = r[0]; run = new Run(); }
            run.gives.clear();
            run.teleports.clear();
            run.broadcasts.clear();
            run.delivered.clear();
            Object ret = apply(run, (List<Object>) MiniJson.parse(r[2]));
            String where = "seed " + r[0] + " step " + r[1] + " op " + r[2];
            assertEquals(MiniJson.parse(r[3]), ret instanceof List ? new ArrayList<Object>((List<Object>) ret) : ret, "result at " + where);
            List<Object> expectedMessages = (List<Object>) MiniJson.parse(r[4]);
            assertEquals(expectedMessages.size(), run.delivered.size(), "message count at " + where);
            for (int i = 0; i < expectedMessages.size(); i++) {
                List<Object> m = (List<Object>) expectedMessages.get(i);
                ChatService.Message actual = run.delivered.get(i);
                assertEquals(((Double) m.get(0)).intValue(), actual.id, "id at " + where);
                assertEquals(m.get(1), actual.kind, "kind at " + where);
                assertEquals(m.get(2), actual.senderId, "sender at " + where);
                assertEquals(m.get(3), actual.senderName, "name at " + where);
                assertEquals(m.get(4), actual.text, "text at " + where);
                assertEquals(m.get(5), actual.recipientId, "recipient at " + where);
            }
            List<Object> state = (List<Object>) MiniJson.parse(r[5]);
            List<Object> settings = (List<Object>) state.get(0);
            String[] names = CommandPlayer.SETTING_NAMES;
            for (int i = 0; i < names.length; i++)
                assertTrue(sameBits(num((String) settings.get(i)), run.player.setting(names[i])), names[i] + " at " + where + ": expected " + settings.get(i) + " got " + run.player.setting(names[i]));
            // Launch velocity comes from Math.log/Math.pow, which engines compute slightly differently (V8 differs from
            // fdlibm by a few units in the last place), so it is compared closely, not bit for bit. Nothing else in the
            // replies or settings depends on it.
            double expectedLaunch = num((String) state.get(1));
            assertTrue(sameBits(expectedLaunch, run.player.jumpLaunchVelocity) || Math.abs(expectedLaunch - run.player.jumpLaunchVelocity) <= 1e-12 * Math.abs(expectedLaunch),
                "launch velocity at " + where + ": expected " + state.get(1) + " got " + run.player.jumpLaunchVelocity);
            assertEquals(state.get(2), run.player.gameMode(), "game mode at " + where);
            assertEquals(state.get(3), run.player.developerMode, "developer mode at " + where);
            List<Object> position = (List<Object>) state.get(4);
            assertTrue(sameBits(num((String) position.get(0)), run.player.x) && sameBits(num((String) position.get(1)), run.player.y)
                && sameBits(num((String) position.get(2)), run.player.z), "position at " + where);
            assertEquals(state.get(5), new ArrayList<Object>(run.gives), "gives at " + where);
            List<Object> teleports = (List<Object>) state.get(6);
            assertEquals(teleports.size(), run.teleports.size(), "teleport count at " + where);
            for (int i = 0; i < teleports.size(); i++) {
                String[] t = ((String) teleports.get(i)).split(":");
                for (int k = 0; k < 3; k++) assertTrue(sameBits(num(t[k]), run.teleports.get(i)[k]), "teleport " + i + " at " + where);
            }
            List<Object> broadcasts = new ArrayList<>();
            for (Integer id : run.broadcasts) broadcasts.add(id.doubleValue());
            assertEquals(state.get(7), broadcasts, "broadcasts at " + where);
            assertEquals(((Double) state.get(8)).intValue(), run.service.messages().size(), "history size at " + where);
        }
    }
}
