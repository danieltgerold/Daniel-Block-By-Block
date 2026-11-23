package blockbyblock.core.chat;

import blockbyblock.core.text.JsText;
import java.util.ArrayList;
import java.util.List;

/**
 * Port of ChatService (src/chat.js): the one path every message takes. Private messages (command replies) reach only
 * their recipient; public chat is also handed to an optional broadcast hook, incoming messages never are.
 */
public final class ChatService {
    /** A delivered message. Ids count up from 1 in delivery order. */
    public static final class Message {
        public final int id;
        public final String senderId, senderName, text, kind, recipientId;

        Message(int id, String senderId, String senderName, String text, String kind, String recipientId) {
            this.id = id;
            this.senderId = senderId;
            this.senderName = senderName;
            this.text = text;
            this.kind = kind;
            this.recipientId = recipientId;
        }
    }

    @FunctionalInterface
    public interface Listener {
        void onMessage(Message message);
    }

    /** At most this many recent messages are kept. */
    public static final int HISTORY = 100;

    private final String playerId, playerName;
    private final CommandPlayer controller;
    private final Listener broadcast;
    private final List<Message> messages = new ArrayList<>();
    private final List<Listener> listeners = new ArrayList<>();
    private int sequence;

    /** @param broadcast called for each public message this player sends; may be null */
    public ChatService(String playerId, String playerName, CommandPlayer controller, Listener broadcast) {
        this.playerId = playerId;
        this.playerName = playerName;
        this.controller = controller;
        this.broadcast = broadcast;
    }

    public CommandPlayer controller() { return controller; }
    public List<Message> messages() { return messages; }
    public void subscribe(Listener listener) { listeners.add(listener); }

    /** Delivers a message to this player unless it is addressed to someone else; returns whether it was delivered. */
    public boolean deliver(String senderId, String senderName, String text, String kind, String recipientId, boolean broadcastIt) {
        if (recipientId != null && !recipientId.isEmpty() && !recipientId.equals(playerId)) return false;
        Message delivered = new Message(++sequence, senderId, senderName, text, kind, recipientId);
        messages.add(delivered);
        if (messages.size() > HISTORY) messages.remove(0);
        for (Listener listener : listeners) listener.onMessage(delivered);
        if (broadcastIt && (delivered.recipientId == null || delivered.recipientId.isEmpty()) && broadcast != null) broadcast.onMessage(delivered);
        return true;
    }

    /** A private reply from the server. */
    public boolean reply(String text) {
        return deliver(PlayerNames.SERVER_ID, "server", text, "system", playerId, false);
    }

    /** What the player typed: a command if it starts with a slash, otherwise public chat. Blank input does nothing. */
    public boolean submit(String value) {
        String text = JsText.trim(value);
        if (text.isEmpty()) return false;
        if (text.startsWith("/")) {
            command(text);
            return true;
        }
        deliver(playerId, playerName, text, "chat", null, true);
        return true;
    }

    public List<String> completions(String text) { return Commands.completions(text); }

    public void command(String text) { Commands.apply(this, text); }
}
