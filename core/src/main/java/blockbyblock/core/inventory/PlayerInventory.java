package blockbyblock.core.inventory;

import blockbyblock.core.item.ItemDefinition;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Port of PlayerInventory in src/inventory.js: the hotbar/main/offhand slots, the held cursor stack and
 * every slot operation a client can ask for. Operations are translated literally, quirks included, so the
 * state after any operation matches the JS bit for bit.
 */
public final class PlayerInventory {
    public static final int[] HOTBAR = range(0, 9);
    public static final int[] MAIN = range(9, 36);
    public static final int[] STORAGE = range(0, 36);
    public static final int OFFHAND = 40;
    public static final int CRAFT_START = 41;
    private static final int SLOT_COUNT = 50;

    private static int[] range(int from, int to) {
        int[] a = new int[to - from];
        for (int i = 0; i < a.length; i++) a[i] = from + i;
        return a;
    }

    private final ItemStack[] slots = new ItemStack[SLOT_COUNT];
    private ItemStack cursor;
    private int selected;
    private final DropSink onDrop;

    public PlayerInventory(DropSink onDrop) { this.onDrop = onDrop; }

    public ItemStack get(int index) { return index >= 0 && index < SLOT_COUNT ? slots[index] : null; }
    public ItemStack cursor() { return cursor; }
    public int selected() { return selected; }
    public ItemStack mainHand() { return slots[selected]; }
    public ItemStack offhand() { return slots[OFFHAND]; }

    public boolean isSlot(int index) { return index >= 0 && index < 41; }

    public boolean accepts(int index, String id) {
        return ItemDefinition.exists(id) && isSlot(index) && (index < 36 || index == OFFHAND);
    }

    private static int maxStack(String id) { return ItemDefinition.forId(id).maxStack; }

    public long capacity(String id, int[] indices, int damage) {
        if (!ItemDefinition.exists(id)) return 0;
        ItemStack incoming = new ItemStack(id, 1, damage);
        int max = maxStack(id);
        long total = indices == STORAGE && ItemStack.same(offhand(), incoming) ? max - offhand().count : 0;
        // At most 36 indices.
        for (int i : indices) {
            if (accepts(i, id) && (slots[i] == null || ItemStack.same(slots[i], incoming))) total += max - (slots[i] == null ? 0 : slots[i].count);
        }
        return total;
    }

    /** Adds items, preferring partial stacks (selected slot, offhand first when storing); returns what did not fit. */
    public long insert(String id, long count, int[] indices, int damage) {
        long remaining = count;
        if (!ItemDefinition.exists(id) || remaining < 0) throw new IllegalArgumentException("Invalid item stack");
        int[] partials = indices;
        if (indices == STORAGE) {
            partials = new int[STORAGE.length + 1];
            partials[0] = selected;
            partials[1] = OFFHAND;
            int n = 2;
            for (int i : STORAGE) if (i != selected) partials[n++] = i;
        }
        ItemStack incoming = new ItemStack(id, 1, damage);
        int max = maxStack(id);
        for (boolean empty : new boolean[] {false, true}) for (int i : empty ? indices : partials) {
            if (remaining == 0) break;
            ItemStack stack = slots[i];
            if (!accepts(i, id) || (empty ? stack != null : !ItemStack.same(stack, incoming))) continue;
            long amount = Math.min(remaining, max - (stack == null ? 0 : stack.count));
            if (amount != 0) {
                slots[i] = new ItemStack(id, (stack == null ? 0 : stack.count) + amount, damage);
                remaining -= amount;
            }
        }
        return remaining;
    }

    public void select(int index) { selected = (index + 9) % 9; }

    public boolean consumeSelected() {
        ItemStack stack = mainHand();
        if (stack == null) return false;
        if (--stack.count == 0) slots[selected] = null;
        return true;
    }

    public void click(int index, int button) {
        ItemStack stack = get(index);
        if (!isSlot(index)) {
            // Furnace output and non-slots: nothing to do without an open furnace.
            return;
        }
        if (cursor == null) {
            if (stack == null) return;
            long count = button == 2 ? (stack.count + 1) / 2 : stack.count;
            cursor = stack.copyWithCount(count);
            stack.count -= count;
            if (stack.count == 0) slots[index] = null;
        } else if (accepts(index, cursor.id)) {
            if (stack == null || ItemStack.same(stack, cursor)) {
                long amount = Math.min(button == 2 ? 1 : cursor.count, maxStack(cursor.id) - (stack == null ? 0 : stack.count));
                slots[index] = cursor.copyWithCount((stack == null ? 0 : stack.count) + amount);
                cursor.count -= amount;
                if (cursor.count == 0) cursor = null;
            } else {
                ItemStack swapped = cursor;
                cursor = stack;
                slots[index] = swapped;
            }
        }
    }

    /** Planned drag distribution: slot index to count, in the order the JS plan lists them. */
    private Map<Integer, Long> dragPlan(List<Integer> indices, int button) {
        Map<Integer, Long> plan = new LinkedHashMap<>();
        if (cursor == null) return plan;
        List<Integer> eligible = new ArrayList<>();
        // Duplicates are dropped, keeping the first occurrence.
        for (int i : new LinkedHashSet<>(indices)) {
            if (accepts(i, cursor.id) && (slots[i] == null || ItemStack.same(slots[i], cursor))
                && (slots[i] == null ? 0 : slots[i].count) < maxStack(cursor.id)) eligible.add(i);
        }
        long share = button == 2 ? 1 : cursor.count / (eligible.isEmpty() ? 1 : eligible.size());
        long left = cursor.count;
        for (int i : eligible) {
            long count = Math.min(Math.min(share, left), maxStack(cursor.id) - (slots[i] == null ? 0 : slots[i].count));
            if (count != 0) { plan.put(i, count); left -= count; }
        }
        return plan;
    }

    public void drag(List<Integer> indices, int button) {
        for (Map.Entry<Integer, Long> step : dragPlan(indices, button).entrySet()) {
            int i = step.getKey();
            slots[i] = cursor.copyWithCount((slots[i] == null ? 0 : slots[i].count) + step.getValue());
            cursor.count -= step.getValue();
        }
        if (cursor != null && cursor.count == 0) cursor = null;
    }

    public void shift(int index) {
        ItemStack stack = get(index);
        if (stack == null) return;
        int[] target = index < 9 ? MAIN : index < 36 ? HOTBAR : STORAGE;
        long remaining = insert(stack.id, stack.count, target, stack.damage);
        // The JS keeps the old stack object here, even if insert wrote over its own slot (offhand into itself).
        slots[index] = remaining != 0 ? stack.copyWithCount(remaining) : null;
    }

    public void shiftMatching(String id, boolean fromHotbar) {
        for (int i : fromHotbar ? HOTBAR : MAIN) if (slots[i] != null && slots[i].id.equals(id)) shift(i);
    }

    /** Gathers matching stacks into the cursor (double-click); a null id means "whatever the cursor holds". */
    public void collect(String id) {
        if (id == null && cursor != null) id = cursor.id;
        if (id == null || (cursor != null && !cursor.id.equals(id))) return;
        int[] order = new int[STORAGE.length + 5];
        System.arraycopy(STORAGE, 0, order, 0, STORAGE.length);
        int n = STORAGE.length;
        order[n++] = OFFHAND;
        for (int i = 36; i <= 39; i++) order[n++] = i;
        int max = maxStack(id);
        for (int i : order) {
            ItemStack stack = slots[i];
            if (stack == null || !stack.id.equals(id)) continue;
            if (cursor == null) cursor = stack.copyWithCount(0);
            if (!ItemStack.same(stack, cursor)) continue;
            long amount = Math.min(stack.count, max - cursor.count);
            cursor.count += amount;
            stack.count -= amount;
            if (stack.count == 0) slots[i] = null;
        }
        if (cursor != null && cursor.count == 0) cursor = null;
    }

    public boolean swap(int a, int b) {
        if (!isSlot(a) || !isSlot(b)) return false;
        ItemStack left = slots[a], right = slots[b];
        if ((left != null && !accepts(b, left.id)) || (right != null && !accepts(a, right.id))) return false;
        slots[a] = right;
        slots[b] = left;
        return true;
    }

    public boolean drop(int index, boolean whole) {
        ItemStack stack = get(index);
        if (stack == null) return false;
        long count = whole ? stack.count : 1;
        onDrop.drop(stack.copyWithCount(count));
        stack.count -= count;
        if (stack.count == 0) slots[index] = null;
        return true;
    }

    public void dropCursor(boolean whole) {
        if (cursor == null) return;
        long count = whole ? cursor.count : 1;
        onDrop.drop(cursor.copyWithCount(count));
        cursor.count -= count;
        if (cursor.count == 0) cursor = null;
    }

    /** Returns crafting-grid items to storage; with no grid open there is nothing to return. */
    private void endCrafting() {
        List<ItemStack> overflow = new ArrayList<>();
        for (int i = CRAFT_START; i < CRAFT_START + 9; i++) {
            ItemStack stack = slots[i];
            slots[i] = null;
            if (stack != null) {
                long left = insertStack(stack);
                if (left != 0) overflow.add(stack.copyWithCount(left));
            }
        }
        for (ItemStack stack : overflow) onDrop.drop(stack);
    }

    /** insertItemStacks over STORAGE: merge into matching stacks first, then empty slots. */
    private long insertStack(ItemStack stack) {
        long left = stack.count;
        int cap = maxStack(stack.id);
        for (boolean empty : new boolean[] {false, true}) for (int i : STORAGE) {
            ItemStack at = slots[i];
            if (empty ? at != null : !ItemStack.same(at, stack)) continue;
            long n = Math.min(left, cap - (at == null ? 0 : at.count));
            if (n != 0) slots[i] = stack.copyWithCount((at == null ? 0 : at.count) + n);
            left -= n;
            if (left == 0) return 0;
        }
        return left;
    }

    public void close() {
        endCrafting();
        if (cursor != null) {
            ItemStack held = cursor;
            long remainder = insert(held.id, held.count, STORAGE, held.damage);
            if (remainder != 0) onDrop.drop(held.copyWithCount(remainder));
            cursor = null;
        }
    }

    public void dropCarried(DropSink sink) {
        List<ItemStack> stacks = new ArrayList<>();
        for (int i = 0; i < SLOT_COUNT; i++) if (slots[i] != null) stacks.add(slots[i].copy());
        if (cursor != null) stacks.add(cursor.copy());
        for (int i = 0; i < SLOT_COUNT; i++) slots[i] = null;
        cursor = null;
        for (ItemStack stack : stacks) sink.drop(stack);
    }

    public SavedInventory save() {
        SavedInventory data = new SavedInventory();
        for (int i = 0; i < SLOT_COUNT; i++) if (slots[i] != null) data.slots.put(i, new SavedInventory.SavedStack(slots[i].id, slots[i].count, slots[i].damage));
        if (cursor != null) data.cursor = new SavedInventory.SavedStack(cursor.id, cursor.count, cursor.damage);
        data.selected = (double) selected;
        return data;
    }

    /** Loads a save, repairing bad entries: unknown ids and non-positive or fractional counts vanish, oversize stacks overflow. */
    public void load(SavedInventory data) {
        cursor = null;
        for (int i = 0; i < SLOT_COUNT; i++) slots[i] = null;
        List<ItemStack> overflow = new ArrayList<>();
        for (int i = 0; i < SLOT_COUNT; i++) slots[i] = read(data.slots.get(i), overflow);
        cursor = read(data.cursor, overflow);
        selected = data.selected != null && data.selected == Math.floor(data.selected) && !Double.isInfinite(data.selected)
            ? (int) Math.max(0, Math.min(8, data.selected)) : 0;
        endCrafting();
        for (ItemStack stack : overflow) {
            long left = insert(stack.id, stack.count, STORAGE, stack.damage);
            if (left != 0) onDrop.drop(stack.copyWithCount(left));
        }
    }

    private static ItemStack read(SavedInventory.SavedStack saved, List<ItemStack> overflow) {
        if (saved == null || !ItemDefinition.exists(saved.id) || saved.count != Math.floor(saved.count)
            || Math.abs(saved.count) > 9007199254740991.0 || saved.count <= 0) return null;
        long count = (long) saved.count;
        int cap = maxStack(saved.id);
        long n = Math.min(cap, count);
        ItemStack copy = new ItemStack(saved.id, n, saved.damage);
        if (count > n) overflow.add(copy.copyWithCount(count - n));
        return copy;
    }

    public boolean pick(String id, boolean creative) {
        if (!ItemDefinition.exists(id)) return false;
        for (int i : HOTBAR) if (slots[i] != null && slots[i].id.equals(id)) { select(i); return true; }
        if (creative) {
            int index = -1;
            for (int i : HOTBAR) if (slots[i] == null) { index = i; break; }
            if (index < 0) index = selected;
            ItemStack displaced = slots[index];
            slots[index] = null;
            if (displaced != null) {
                long remaining = insert(displaced.id, displaced.count, MAIN, displaced.damage);
                if (remaining != 0) onDrop.drop(displaced.copyWithCount(remaining));
            }
            slots[index] = new ItemStack(id, 1);
            select(index);
            return true;
        }
        for (int i : MAIN) if (slots[i] != null && slots[i].id.equals(id)) return swap(i, selected);
        return false;
    }
}
