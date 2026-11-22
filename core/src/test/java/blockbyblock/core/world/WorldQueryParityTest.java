package blockbyblock.core.world;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import blockbyblock.core.golden.WorldFixture;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.nio.file.Path;
import java.nio.file.Files;
import java.io.IOException;
import org.junit.jupiter.api.Test;

class WorldQueryParityTest {
    @Test void typedWorldQueriesMatchCurrentJs() throws IOException {
        var dir = GoldenCsv.dir().resolve("world");
        Map<String, VoxelWorld> worlds = new LinkedHashMap<>();
        for (String[] r : table(dir.resolve("worlds.csv"), "world,baseY,layers", 3)) {
            assertEquals(3, r.length);
            String[] layers = r[2].isEmpty() ? new String[0] : r[2].split("\\|");
            worlds.put(r[0], new VoxelWorld(Double.parseDouble(r[1]), layers));
        }
        assertEquals(3, worlds.size(), "world configurations");
        for (String[] r : table(dir.resolve("edits.csv"), "world,x,y,z,id,type,facing,half,stairShape,hinge,open,level,falling", 18))
            WorldFixture.loadEdit(worlds.get(r[0]), r, 1);
        var queries = table(dir.resolve("queries.csv"), "case,world,op,a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10", 312);
        var expected = table(dir.resolve("expected.csv"), "case,count,v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10", 312);
        assertEquals(312, queries.size(), "query coverage");
        assertEquals(queries.size(), expected.size(), "short reference");
        // Bounded by the 312 explicitly recorded queries, each result <=11 values.
        for (int i = 0; i < queries.size(); i++) {
            String[] q = queries.get(i), e = expected.get(i);
            assertEquals(14, q.length); assertEquals(13, e.length);
            assertEquals(Integer.toString(i), q[0]); assertEquals(q[0], e[0]);
            double[] a = new double[11];
            for (int k = 0; k < a.length; k++) a[k] = Double.parseDouble(q[k + 3]);
            double[] got = evaluate(worlds.get(q[1]), q[2], a);
            assertEquals(Integer.parseInt(e[1]), got.length, "result width " + i);
            for (int k = 0; k < got.length; k++) assertTrue(GoldenCsv.sameBits(Double.parseDouble(e[k + 2]), got[k]),
                "query " + i + " (" + q[2] + "), field " + k + ": expected " + e[k + 2] + " got " + got[k]);
        }
    }

    private static List<String[]> table(Path file, String header, int count) throws IOException {
        try (var lines = Files.lines(file)) { assertEquals(header, lines.findFirst().orElseThrow(), file.toString()); }
        List<String[]> rows = GoldenCsv.read(file);
        assertEquals(count, rows.size(), "fixture coverage " + file);
        for (String[] row : rows) assertEquals(header.split(",").length, row.length, "fixture width " + file);
        return rows;
    }

    private static double[] evaluate(VoxelWorld w, String op, double[] a) {
        return switch (op) {
            case "ray" -> ray(w, a);
            case "supported" -> new double[] {w.isSupported(a[0], a[1], a[2], a[3]) ? 1 : 0};
            case "overlap" -> new double[] {w.intersectsPlayer(a[0], a[1], a[2], .3 * a[3], 1.8 * a[3]) ? 1 : 0};
            case "path" -> new double[] {w.supportedPath(a[0], a[1], a[2], .3, a[3], a[4], a[5]) ? 1 : 0};
            case "raw", "step" -> motion(w, op, a);
            default -> throw new IllegalArgumentException("Unknown operation " + op);
        };
    }

    private static double[] ray(VoxelWorld w, double[] a) {
        RaycastHit h = w.raycast(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7] != 0);
        return h == null ? new double[11] : new double[] {1, h.x, h.y, h.z, h.nx, h.ny, h.nz, h.distance,
            h.pointX, h.pointY, h.pointZ};
    }

    private static double[] motion(VoxelWorld w, String op, double[] a) {
        VoxelWorld.Motion m = op.equals("raw") ? w.moveRaw(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7])
            : w.movePlayer(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8] == 0 ? 1 : a[8], a[9] != 0, a[10] != 0);
        return new double[] {m.x, m.y, m.z, m.movedX, m.movedY, m.movedZ,
            m.blockedX ? 1 : 0, m.blockedY ? 1 : 0, m.blockedZ ? 1 : 0, m.grounded ? 1 : 0};
    }
}
