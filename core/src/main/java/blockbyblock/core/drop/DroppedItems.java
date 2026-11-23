package blockbyblock.core.drop;

import blockbyblock.core.inventory.PlayerInventory;
import blockbyblock.core.item.ItemDefinition;
import blockbyblock.core.world.VoxelWorld;
import blockbyblock.core.world.WorldFluids;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Port of DroppedItems in src/dropped-items.js: item piles in the world with motion, lifetimes, merging and
 * pickup into an inventory. The cosmetic parts of the JS (merge animations, bobbing phase, interpolation
 * positions) are not modelled. Quantities are longs; the JS uses bigints.
 */
public final class DroppedItems {
    /** Seconds a lot stays in the world. */
    private static final double LIFETIME = 300;

    /** A group of items from one spawn with its own pickup delay and expiry. */
    public static final class Lot {
        public long count;
        public final double expires, pickup;

        Lot(long count, double expires, double pickup) {
            this.count = count;
            this.expires = expires;
            this.pickup = pickup;
        }
    }

    /** A pile of one item type at one place; merged piles keep their lots' own deadlines. */
    public static final class Pile {
        public final int id;
        public final String item;
        public final int damage;
        public double x, y, z, vx, vy, vz;
        public long count;
        public final boolean thrown;
        public List<Lot> lots = new ArrayList<>();

        Pile(int id, String item, int damage, double x, double y, double z, boolean thrown) {
            this.id = id;
            this.item = item;
            this.damage = damage;
            this.x = x;
            this.y = y;
            this.z = z;
            this.thrown = thrown;
        }
    }

    private final VoxelWorld world;
    private final PlayerInventory inventory;
    private double time;
    private int serial;
    private List<Pile> piles = new ArrayList<>();

    public DroppedItems(VoxelWorld world, PlayerInventory inventory) {
        this.world = world;
        this.inventory = inventory;
    }

    public double time() { return time; }
    public List<Pile> piles() { return piles; }

    /** Items currently lying in the world, over all lots. */
    public long total() {
        long sum = 0;
        for (Pile p : piles) for (Lot l : p.lots) sum += l.count;
        return sum;
    }

    private static long lotCount(List<Lot> lots, double time) {
        long sum = 0;
        for (Lot lot : lots) sum += lot.expires > time + 1e-8 ? lot.count : 0;
        return sum;
    }

    private static boolean stackable(Pile a, Pile b) { return a.item.equals(b.item) && a.damage == b.damage; }

    private static double distance(Pile a, Pile b) {
        double dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /** Drops {@code count} of an item. Null velocity components use the defaults (0, 0.08, 0). */
    public Pile spawn(String id, long count, double x, double y, double z, boolean thrown,
                      Double vx, Double vy, Double vz, int damage) {
        if (count <= 0) return null;
        Pile pile = new Pile(++serial, id, damage, x, y, z, thrown);
        pile.count = count;
        pile.vx = vx == null ? 0 : vx;
        pile.vy = vy == null ? .08 : vy;
        pile.vz = vz == null ? 0 : vz;
        pile.lots.add(new Lot(count, time + LIFETIME, time + (thrown ? 2 : 0)));
        // Thrown items get their launch physics before joining a nearby pile.
        Pile target = null;
        if (!thrown && ItemDefinition.forId(id).durability == 0) {
            for (Pile p : piles) {
                if (!stackable(p, pile) || distance(p, pile) > 2) continue;
                if (target == null || p.count > target.count || p.count == target.count && p.id < target.id) target = p;
            }
        }
        piles.add(pile);
        if (target == null) return pile;
        return pile.count > target.count ? merge(target, pile) : merge(pile, target);
    }

    private Pile merge(Pile source, Pile target) {
        if (source == target || !piles.contains(source) || !piles.contains(target)
            || ItemDefinition.forId(source.item).durability != 0 || !stackable(source, target)) return target;
        // Ownership transfers exactly once, immediately.
        target.lots.addAll(source.lots);
        target.count += source.count;
        source.lots = new ArrayList<>();
        source.count = 0;
        List<Pile> kept = new ArrayList<>();
        for (Pile p : piles) if (p != source) kept.add(p);
        piles = kept;
        return target;
    }

    /**
     * One 0.05 second tick: move every pile, let the player pick things up, then merge neighbours.
     * The player is its position, size and whether it crouches.
     */
    public void step(double px, double py, double pz, double size, boolean crouching, boolean pickup) {
        time += .05;
        double halfWidth = .3 * size, height = (crouching ? 1.5 : 1.8) * size;
        double minX = px - halfWidth - 1, minY = py - .5, minZ = pz - halfWidth - 1;
        double maxX = px + halfWidth + 1, maxY = py + height + .5, maxZ = pz + halfWidth + 1;
        for (Pile pile : piles) {
            List<Lot> alive = new ArrayList<>();
            for (Lot l : pile.lots) if (l.expires > time + 1e-8) alive.add(l);
            pile.lots = alive;
            pile.count = lotCount(pile.lots, time);
            if (pile.lots.isEmpty()) continue;
            WorldFluids.Sample medium = world.sample(new double[] {pile.x - .125, pile.y, pile.z - .125},
                new double[] {pile.x + .125, pile.y + .25, pile.z + .125});
            if (medium != null && medium.inWater) {
                pile.vx += medium.x * .014;
                pile.vy += medium.y * .014;
                pile.vz += medium.z * .014;
            }
            double oldVy = pile.vy;
            VoxelWorld.Motion motion = world.movePlayer(pile.x, pile.y, pile.z, pile.vx, pile.vy, pile.vz, .125, .25);
            pile.x = motion.x;
            pile.y = motion.y;
            pile.z = motion.z;
            pile.vx = motion.blockedX ? 0 : pile.vx * (motion.grounded ? .6 : .98);
            pile.vz = motion.blockedZ ? 0 : pile.vz * (motion.grounded ? .6 : .98);
            double bounce = oldVy < 0 ? -oldVy * .2 : 0;
            pile.vy = motion.blockedY ? (bounce >= .02 ? bounce : 0) : (oldVy - .04) * .98;
            boolean touches = pickup && pile.x + .125 > minX && pile.x - .125 < maxX
                && pile.y + .25 > minY && pile.y < maxY && pile.z + .125 > minZ && pile.z - .125 < maxZ;
            if (touches && inventory.capacity(pile.item, PlayerInventory.STORAGE, pile.damage) != 0) {
                for (Lot lot : pile.lots) {
                    if (lot.pickup <= time + 1e-8 && lot.count != 0) lot.count = inventory.insert(pile.item, lot.count, PlayerInventory.STORAGE, pile.damage);
                }
                List<Lot> left = new ArrayList<>();
                for (Lot l : pile.lots) if (l.count > 0) left.add(l);
                pile.lots = left;
                pile.count = lotCount(pile.lots, time);
            }
        }
        List<Pile> living = new ArrayList<>();
        for (Pile p : piles) if (!p.lots.isEmpty()) living.add(p);
        piles = living;
        // Largest piles lead each spatial bucket; smaller ones merge into them. Merged lots keep their deadlines.
        Map<String, List<Pile>> buckets = new HashMap<>(); // lookup only; never iterated
        List<Pile> sorted = new ArrayList<>(piles);
        sorted.sort((a, b) -> a.count != b.count ? Long.compare(b.count, a.count) : Integer.compare(a.id, b.id));
        for (Pile pile : sorted) {
            if (ItemDefinition.forId(pile.item).durability != 0) continue;
            long cx = (long) Math.floor(pile.x / 2), cy = (long) Math.floor(pile.y / 2), cz = (long) Math.floor(pile.z / 2);
            Pile target = null;
            // 27 neighbouring cells, x outermost, stopping at the first pile within range.
            for (long x = cx - 1; x <= cx + 1 && target == null; x++) for (long y = cy - 1; y <= cy + 1 && target == null; y++)
                for (long z = cz - 1; z <= cz + 1 && target == null; z++) {
                    List<Pile> bucket = buckets.get(pile.item + ":" + pile.damage + ":" + x + "," + y + "," + z);
                    if (bucket == null) continue;
                    for (Pile candidate : bucket) if (distance(candidate, pile) <= 2) { target = candidate; break; }
                }
            if (target != null) merge(pile, target);
            else buckets.computeIfAbsent(pile.item + ":" + pile.damage + ":" + cx + "," + cy + "," + cz, k -> new ArrayList<>()).add(pile);
        }
    }
}
