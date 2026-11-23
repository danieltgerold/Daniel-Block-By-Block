package blockbyblock.core.inventory;

import blockbyblock.core.recipe.Recipes;
import blockbyblock.core.recipe.SmeltingRecipe;

/** Port of FurnaceEntity in src/smelting.js: input, fuel and output slots plus the burn and cook counters. */
public final class FurnaceEntity {
    public static final int INPUT = 0, FUEL = 1, OUTPUT = 2;
    private final ItemStack[] slots = new ItemStack[3];
    public int burnTime;
    public int burnDuration;
    public int cookTime;
    /** The smelting recipe id seen on the last tick, or null. */
    public String recipeId;
    /** Set when the furnace block is destroyed; a removed furnace no longer ticks. */
    public boolean removed;

    public FurnaceEntity() {}

    public FurnaceEntity(ItemStack input, ItemStack fuel, ItemStack output, int burnTime, int burnDuration, int cookTime) {
        slots[INPUT] = ItemStack.copyOf(input);
        slots[FUEL] = ItemStack.copyOf(fuel);
        slots[OUTPUT] = ItemStack.copyOf(output);
        this.burnTime = burnTime;
        this.burnDuration = burnDuration;
        this.cookTime = cookTime;
    }

    public ItemStack slot(int i) { return slots[i]; }
    public void setSlot(int i, ItemStack stack) { slots[i] = stack; }

    private SmeltingRecipe recipe() { return slots[INPUT] == null ? null : Recipes.smeltingFor(slots[INPUT].id); }

    boolean canCook() {
        SmeltingRecipe r = recipe();
        ItemStack out = slots[OUTPUT];
        return r != null && slots[INPUT].count > 0 && (out == null || out.id.equals(r.output))
            && (out == null ? 0 : out.count) + r.count <= 64;
    }

    /** One game tick. */
    public void tick() {
        if (removed) return;
        if (burnTime > 0) burnTime--;
        SmeltingRecipe recipe = recipe();
        boolean valid = canCook();
        String id = recipe == null ? null : recipe.id;
        if (!java.util.Objects.equals(recipeId, id)) cookTime = 0;
        recipeId = id;
        if (burnTime == 0 && valid && slots[FUEL] != null && Recipes.fuelTicks(slots[FUEL].id) > 0) {
            burnDuration = burnTime = Recipes.fuelTicks(slots[FUEL].id);
            if (--slots[FUEL].count == 0) slots[FUEL] = null;
        }
        if (!valid) cookTime = 0;
        else if (burnTime > 0) {
            if (++cookTime >= recipe.ticks) {
                if (--slots[INPUT].count == 0) slots[INPUT] = null;
                slots[OUTPUT] = new ItemStack(recipe.output, (slots[OUTPUT] == null ? 0 : slots[OUTPUT].count) + recipe.count);
                cookTime = 0;
            }
        } else cookTime = Math.max(0, cookTime - 2);
    }
}
