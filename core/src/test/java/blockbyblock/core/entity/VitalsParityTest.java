package blockbyblock.core.entity;

import static blockbyblock.core.golden.GoldenCsv.num;
import static blockbyblock.core.golden.GoldenCsv.sameBits;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Replays every recorded JS PlayerVitals operation and compares each field, bit for bit, after every step. */
class VitalsParityTest {
    private static Double opt(String t) { return t.equals("-") ? null : Double.valueOf(t); }

    private static String apply(PlayerVitals v, String op) {
        String[] a = op.split(":", -1);
        switch (a[0]) {
            case "tick": {
                PlayerVitals.TickInput in = new PlayerVitals.TickInput();
                in.playerY = Double.parseDouble(a[1]);
                in.inWater = a[2].equals("1");
                in.grounded = a[3].equals("1");
                in.sprinting = a[4].equals("1");
                in.landingDamageDistance = a[5].equals("-") ? 0 : Double.parseDouble(a[5]);
                in.playerSize = Double.parseDouble(a[6]);
                in.distance = Double.parseDouble(a[7]);
                in.swimDistance = Double.parseDouble(a[8]);
                in.jumped = a[9].equals("1");
                in.sprintJump = a[10].equals("1");
                in.creative = a[11].equals("1");
                if (!a[12].equals("-") || !a[13].equals("-")) in.settings = new PlayerVitals.Settings(in.playerSize, opt(a[12]), opt(a[13]));
                v.tick(in);
                return "-";
            }
            case "damage": v.damage(Double.parseDouble(a[1]), a[2]); return "-";
            case "exhaust": v.exhaust(Double.parseDouble(a[1])); return "-";
            case "process": v.processExhaustion(); return "-";
            case "eat": return v.eat(Double.parseDouble(a[1]), Double.parseDouble(a[2])) ? "1" : "0";
            case "restore": v.restore(opt(a[1]), opt(a[2]), opt(a[3]), opt(a[4])); return "-";
            case "reset": v.reset(); return "-";
            default: throw new IllegalArgumentException(op);
        }
    }

    @Test void matchesJsFieldForFieldAfterEveryOperation() throws Exception {
        var path = GoldenCsv.dir().resolve("vitals").resolve("trace.csv");
        assertEquals("seed,step,op,health,hunger,saturation,exhaustion,regenTicks,regenMode,voidTicks,dead,events,ret", Files.readAllLines(path).get(0));
        List<String[]> rows = GoldenCsv.read(path);
        assertTrue(rows.size() >= 4975, "fixture shrank");
        List<String> mismatches = new ArrayList<>();
        PlayerVitals v = null;
        List<double[]> events = new ArrayList<>();
        List<String> sources = new ArrayList<>();
        String seed = "";
        for (String[] r : rows) {
            if (!r[0].equals(seed)) {
                seed = r[0];
                v = new PlayerVitals();
                v.onDamage = (amount, source) -> { events.add(new double[] {amount}); sources.add(source); };
            }
            events.clear();
            sources.clear();
            String ret = apply(v, r[2]);
            boolean ok = sameBits(num(r[3]), v.health) && sameBits(num(r[4]), v.hunger) && sameBits(num(r[5]), v.saturation)
                && sameBits(num(r[6]), v.exhaustion) && Integer.parseInt(r[7]) == v.regenTicks
                && r[8].equals(v.regenMode == null ? "-" : v.regenMode) && Integer.parseInt(r[9]) == v.voidTicks
                && r[10].equals(v.dead() ? "1" : "0") && r[12].equals(ret);
            String expectedEvents = r[11];
            StringBuilder actualEvents = new StringBuilder();
            boolean eventsOk = true;
            if (expectedEvents.equals("-")) eventsOk = events.isEmpty();
            else {
                String[] parts = expectedEvents.split("\\|");
                eventsOk = parts.length == events.size();
                // At most one damage event per operation.
                for (int i = 0; eventsOk && i < parts.length; i++) {
                    String[] kv = parts[i].split("~");
                    eventsOk = sameBits(num(kv[0]), events.get(i)[0]) && kv[1].equals(sources.get(i));
                }
            }
            if (!ok || !eventsOk) {
                mismatches.add("seed " + r[0] + " step " + r[1] + " op " + r[2] + "\n  expected " + String.join(",", r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12])
                    + "\n  actual   " + v.health + "," + v.hunger + "," + v.saturation + "," + v.exhaustion + "," + v.regenTicks + "," + v.regenMode + "," + v.voidTicks + "," + v.dead() + " events=" + events.size() + " ret=" + ret);
                break;
            }
        }
        assertTrue(mismatches.isEmpty(), "first divergence:\n" + String.join("\n", mismatches));
    }
}
