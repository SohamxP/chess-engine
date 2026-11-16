package com.chessengine.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
public class ChessGameApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private JsonNode create(boolean white, int depth) throws Exception {
        MvcResult result = mvc.perform(post("/api/games")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"playAsWhite\":" + white + ",\"depth\":" + depth + "}"))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode move(String id, String from, String to) throws Exception {
        MvcResult result = mvc.perform(post("/api/games/{id}/moves", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"from\":\"" + from + "\",\"to\":\"" + to + "\"}"))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    @Test void newGameExposesStartingPositionAndTwentyLegalMoves() throws Exception {
        JsonNode state = create(true, 1);
        assertEquals("IN_PROGRESS", state.get("status").asText());
        assertEquals(20, state.get("legalMoves").size());
        assertEquals(0, state.get("moveHistory").size());
        assertTrue(state.get("fen").asText().startsWith("rnbqkbnr/pppppppp/"));
        assertTrue(state.get("humanWhite").asBoolean());
        assertFalse(state.get("aiTurn").asBoolean());
        assertFalse(state.get("canUndo").asBoolean());
        UUID.fromString(state.get("id").asText());
    }

    @Test void legalHumanMoveReturnsFenAndAiTurn() throws Exception {
        JsonNode state = create(true, 1);
        JsonNode moved = move(state.get("id").asText(), "e2", "e4");
        assertTrue(moved.get("fen").asText().contains("4P3"));
        assertTrue(moved.get("aiTurn").asBoolean());
        assertFalse(moved.get("whiteToMove").asBoolean());
        assertEquals(0, moved.get("legalMoves").size());
        assertEquals("e2e4", moved.get("moveHistory").get(0).get("uci").asText());
        assertEquals("e4", moved.get("moveHistory").get(0).get("san").asText());
        assertEquals("e2", moved.get("lastMove").get("from").asText());
        assertTrue(moved.get("canUndo").asBoolean());
    }

    @Test void aiRespondsWithLegalMoveAndSearchStats() throws Exception {
        JsonNode state = create(true, 1);
        String id = state.get("id").asText();
        move(id, "e2", "e4");
        MvcResult response = mvc.perform(post("/api/games/{id}/ai", id))
                .andExpect(status().isOk()).andReturn();
        JsonNode after = json.readTree(response.getResponse().getContentAsString());
        assertFalse(after.get("aiTurn").asBoolean());
        assertTrue(after.get("whiteToMove").asBoolean());
        assertEquals(2, after.get("moveHistory").size());
        assertTrue(after.get("moveHistory").get(1).get("ai").asBoolean());
        assertEquals(1, after.get("aiStats").get("depth").asInt());
        assertTrue(after.get("aiStats").get("nodesVisited").asInt() > 0);
    }

    @Test void undoRestoresPositionBeforeWholeHumanTurn() throws Exception {
        JsonNode initial = create(true, 1);
        String id = initial.get("id").asText();
        move(id, "e2", "e4");
        mvc.perform(post("/api/games/{id}/ai", id)).andExpect(status().isOk());
        MvcResult undone = mvc.perform(post("/api/games/{id}/undo", id))
                .andExpect(status().isOk()).andReturn();
        JsonNode state = json.readTree(undone.getResponse().getContentAsString());
        assertEquals(initial.get("fen").asText(), state.get("fen").asText());
        assertEquals(0, state.get("moveHistory").size());
        assertEquals(20, state.get("legalMoves").size());
        assertFalse(state.get("canUndo").asBoolean());
    }

    @Test void firstAiMoveWorksWhenHumanPlaysBlack() throws Exception {
        JsonNode start = create(false, 1);
        String id = start.get("id").asText();
        assertTrue(start.get("aiTurn").asBoolean());
        assertEquals(0, start.get("legalMoves").size());
        mvc.perform(post("/api/games/{id}/moves", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"from\":\"e7\",\"to\":\"e5\"}"))
                .andExpect(status().isConflict());
        MvcResult reply = mvc.perform(post("/api/games/{id}/ai", id))
                .andExpect(status().isOk()).andReturn();
        JsonNode position = json.readTree(reply.getResponse().getContentAsString());
        assertFalse(position.get("whiteToMove").asBoolean());
        assertFalse(position.get("aiTurn").asBoolean());
        assertEquals(1, position.get("moveHistory").size());
        assertFalse(position.get("canUndo").asBoolean());
    }

    @Test void invalidMoveDoesNotChangeGame() throws Exception {
        JsonNode start = create(true, 1);
        String id = start.get("id").asText();
        mvc.perform(post("/api/games/{id}/moves", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"from\":\"e2\",\"to\":\"e5\"}"))
                .andExpect(status().isBadRequest());
        MvcResult get = mvc.perform(get("/api/games/{id}", id))
                .andExpect(status().isOk()).andReturn();
        JsonNode state = json.readTree(get.getResponse().getContentAsString());
        assertEquals(start.get("fen").asText(), state.get("fen").asText());
        assertEquals(0, state.get("moveHistory").size());
    }

    @Test void rejectsInvalidSquareAndPromotion() throws Exception {
        String id = create(true, 1).get("id").asText();
        mvc.perform(post("/api/games/{id}/moves", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"from\":\"z2\",\"to\":\"e4\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/games/{id}/moves", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"from\":\"e2\",\"to\":\"e4\",\"promotion\":\"K\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test void cannotMoveAiTwiceOrWhileHumanIsToPlay() throws Exception {
        String id = create(true, 1).get("id").asText();
        mvc.perform(post("/api/games/{id}/ai", id)).andExpect(status().isConflict());
        move(id, "e2", "e4");
        mvc.perform(post("/api/games/{id}/moves", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"from\":\"d2\",\"to\":\"d4\"}"))
                .andExpect(status().isConflict());
    }

    @Test void invalidDifficultyIsRejected() throws Exception {
        mvc.perform(post("/api/games").contentType(MediaType.APPLICATION_JSON)
                .content("{\"depth\":0}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/games").contentType(MediaType.APPLICATION_JSON)
                .content("{\"depth\":4}"))
                .andExpect(status().isBadRequest());
    }

    @Test void drawClaimIsRejectedWhenNotEligible() throws Exception {
        String id = create(true, 1).get("id").asText();
        mvc.perform(post("/api/games/{id}/claims", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"claim\":\"THREEFOLD_REPETITION\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/games/{id}/claims", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"claim\":\"INVALID\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test void sessionCanBeDeletedAndThenReturns404() throws Exception {
        String id = create(true, 1).get("id").asText();
        mvc.perform(delete("/api/games/{id}", id)).andExpect(status().isNoContent());
        mvc.perform(get("/api/games/{id}", id)).andExpect(status().isNotFound());
        mvc.perform(post("/api/games/{id}/ai", id)).andExpect(status().isNotFound());
    }

    @Test void nonexistentSessionReturns404() throws Exception {
        mvc.perform(get("/api/games/{id}", UUID.randomUUID())).andExpect(status().isNotFound());
    }

    @Test void cannotUndoBeforeFirstHumanMove() throws Exception {
        String id = create(false, 1).get("id").asText();
        mvc.perform(post("/api/games/{id}/undo", id)).andExpect(status().isConflict());
    }
}
