package blockbyblock.core.world;

import static blockbyblock.core.golden.GoldenCsv.bool;
import static blockbyblock.core.golden.GoldenCsv.num;
import static blockbyblock.core.golden.GoldenCsv.sameBits;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import blockbyblock.core.golden.GoldenCsv;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Every raycast in tests/golden/raycast must match the JS rule code bit for bit. */
class RaycastParityTest {
    static VoxelWorld worldFrom(Path edits) {
        var world = new VoxelWorld(3);
        for (String[] e : GoldenCsv.read(edits)) world.setBlock(num(e[0]), num(e[1]), num(e[2]), bool(e[3]));
        return world;
    }

    @Test void matchesJsRaycastBitForBit() {
        Path dir = GoldenCsv.dir().resolve("raycast");
        VoxelWorld world = worldFrom(dir.resolve("edits.csv"));
        List<String[]> cases = GoldenCsv.read(dir.resolve("cases.csv"));
        List<String[]> expected = GoldenCsv.read(dir.resolve("expected.csv"));
        assertEquals(cases.size(), expected.size(), "cases/expected row count");

        List<String> mismatches = new ArrayList<>();
        for (int i = 0; i < cases.size(); i++) {
            String[] c = cases.get(i), e = expected.get(i);
            RaycastHit hit = world.raycast(num(c[0]), num(c[1]), num(c[2]), num(c[3]), num(c[4]), num(c[5]), num(c[6]));
            boolean ok;
            if (!bool(e[0])) ok = hit == null;
            else ok = hit != null
                && sameBits(num(e[1]), hit.x) && sameBits(num(e[2]), hit.y) && sameBits(num(e[3]), hit.z)
                && sameBits(num(e[4]), hit.nx) && sameBits(num(e[5]), hit.ny) && sameBits(num(e[6]), hit.nz)
                && sameBits(num(e[7]), hit.distance);
            if (!ok && mismatches.size() < 10) {
                mismatches.add("row " + (i + 2) + ": expected " + String.join(",", e) + " got " + hit);
            } else if (!ok) {
                mismatches.add("…");
            }
        }
        if (!mismatches.isEmpty()) fail(mismatches.size() + " mismatches:\n" + String.join("\n", mismatches));
        assertTrue(cases.size() >= 2000, "expected 2,000+ raycasts, got " + cases.size());
        System.out.println("RaycastParityTest: " + cases.size() + " rows checked");
    }
}
