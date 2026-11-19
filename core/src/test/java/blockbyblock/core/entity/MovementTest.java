package blockbyblock.core.entity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class MovementTest {
    @Test void rejectsMissingSimulationArguments() {
        assertThrows(IllegalArgumentException.class, () -> Movement.step(null, new PlayerInput(), null));
        assertThrows(IllegalArgumentException.class, () -> Movement.step(new Player(), null, null));
    }

    @Test void explicitZeroSettingsDifferFromAbsentSettings() {
        Player player = new Player();
        PlayerInput input = new PlayerInput();
        input.forward = 1; input.jump = true;
        input.walkSpeedScale = 0; input.jumpVelocity = 0;
        Movement.step(player, input, null);
        assertEquals(0, player.speed);
        assertEquals(0, player.jumpCount);
        assertEquals(0, player.y);
        assertTrue(player.grounded);
        Player defaults = new Player();
        PlayerInput absent = new PlayerInput();
        absent.forward = 1; absent.jump = true;
        Movement.step(defaults, absent, null);
        assertTrue(defaults.speed > 0);
        assertEquals(.42, defaults.y);
        assertEquals(1, defaults.jumpCount);
    }

    @Test void noWorldJumpMeasurementsFinishWithoutAnimation() {
        Player player = new Player();
        PlayerInput input = new PlayerInput();
        input.jump = true;
        Movement.step(player, input, null);
        input.jump = false;
        // A default-size jump lands within 20 ticks; explicit finite test bound.
        for (int tick = 0; tick < 20 && !player.grounded; tick++) Movement.step(player, input, null);
        assertTrue(player.grounded);
        assertNotNull(player.lastJump);
        assertEquals(12, player.lastJump.ticks);
        assertTrue(player.lastJump.height > 1.25);
        assertFalse(player.jumpInProgress);
        assertTrue(player.landingDamageDistance > player.landingFallDistance);
    }

    @Test void losingFlightPermissionDisablesExistingFlight() {
        Player player = new Player();
        player.y = 10; player.flying = true; player.grounded = false;
        Movement.step(player, new PlayerInput(), null);
        assertFalse(player.flying);
        assertTrue(player.vy < 0);
    }
}
