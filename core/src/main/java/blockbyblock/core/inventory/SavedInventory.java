package blockbyblock.core.inventory;

import java.util.HashMap;
import java.util.Map;

/**
 * An inventory as read from or written to a save. Counts are doubles because saved data can be bad
 * (fractional, negative, oversized) and {@link PlayerInventory#load} must repair it the way the JS does.
 */
public final class SavedInventory {
    public static final class SavedStack {
        public final String id;
        public final double count;
        public final int damage;

        public SavedStack(String id, double count, int damage) {
            this.id = id;
            this.count = count;
            this.damage = damage;
        }
    }

    /** Slot index to saved stack; absent means empty. Lookup only, never iterated. */
    public final Map<Integer, SavedStack> slots = new HashMap<>();
    public SavedStack cursor;
    /** Null when the save has no usable selection. */
    public Double selected;
}
