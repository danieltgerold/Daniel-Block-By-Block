package blockbyblock.core.chat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Name rules and the directory must give the JS's answer for every recorded input, in the JS's order. */
class PlayerNamesParityTest {
    static List<String[]> tsv(String file, String header, int minRows) throws Exception {
        var path = GoldenCsv.dir().resolve("chat").resolve(file);
        List<String> lines = Files.readAllLines(path);
        assertEquals(header, lines.get(0), "fixture schema: " + file);
        List<String[]> rows = new ArrayList<>();
        for (int i = 1; i < lines.size(); i++) if (!lines.get(i).isEmpty()) rows.add(lines.get(i).split("\t", -1));
        assertTrue(rows.size() >= minRows, file + " shrank");
        return rows;
    }

    private static String resultText(PlayerNames.Result r) { return r.ok ? "ok:" + r.name : "err:" + r.error; }

    private static String resultText(PlayerDirectory.Result r) { return r.ok ? "ok:" + r.player.displayName() : "err:" + r.error; }

    @Test void namesAreAcceptedOrRefusedLikeTheJs() throws Exception {
        for (String[] r : tsv("names.tsv", "input\tresult", 191)) {
            Object input = MiniJson.parse(r[0]);
            String value = input instanceof String s && !s.equals("__undefined__") ? s : null; // numbers, objects and undefined are not text
            assertEquals(r[1], resultText(PlayerNames.validate(value)), "name " + r[0]);
        }
    }

    @SuppressWarnings("unchecked")
    @Test void directoryMatchesJsAfterEveryOperation() throws Exception {
        PlayerDirectory dir = null;
        String seed = "";
        for (String[] r : tsv("directory.tsv", "seed\tstep\top\tret\tplayers", 750)) {
            if (!r[0].equals(seed)) { seed = r[0]; dir = new PlayerDirectory(); }
            List<Object> op = (List<Object>) MiniJson.parse(r[2]);
            String name = (String) op.get(0), a = op.size() > 1 ? (String) op.get(1) : null, b = op.size() > 2 ? (String) op.get(2) : null;
            String ret;
            switch (name) {
                case "join": ret = resultText(dir.join(a, b)); break;
                case "rename": ret = resultText(dir.rename(a, b)); break;
                case "available": ret = Boolean.toString(dir.available(a, b)); break;
                default: ret = dir.nextDefaultName();
            }
            String where = "seed " + r[0] + " step " + r[1] + " op " + r[2];
            assertEquals((String) MiniJson.parse(r[3]), ret, "result at " + where);
            List<String> players = new ArrayList<>();
            for (PlayerDirectory.Player p : dir.players()) players.add(p.id + "=" + p.displayName());
            assertEquals((List<Object>) MiniJson.parse(r[4]), new ArrayList<Object>(players), "players at " + where);
        }
    }
}
