package com.chessengine.api;

import com.chessengine.game.DrawClaim;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/games")
public class ChessGameController {
    private final ChessGameService service;

    public ChessGameController(ChessGameService service) {
        this.service = service;
    }

    public record CreateGameRequest(Boolean playAsWhite, Integer depth) { }
    public record MoveRequest(String from, String to, String promotion) { }
    public record DrawClaimRequest(DrawClaim claim) { }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GameView create(@RequestBody(required = false) CreateGameRequest request) {
        return service.create(request == null ? null : request.playAsWhite(),
                request == null ? null : request.depth());
    }

    @GetMapping("/{id}")
    public GameView get(@PathVariable UUID id) { return service.get(id); }

    @PostMapping("/{id}/moves")
    public GameView move(@PathVariable UUID id, @RequestBody MoveRequest move) {
        return service.humanMove(id, move.from(), move.to(), move.promotion());
    }

    @PostMapping("/{id}/ai")
    public GameView ai(@PathVariable UUID id) { return service.aiMove(id); }

    @PostMapping("/{id}/resign")
    public GameView resign(@PathVariable UUID id) { return service.resign(id); }

    @PostMapping("/{id}/offers/draw")
    public GameView.DrawOfferResponse offerDraw(@PathVariable UUID id) {
        return service.offerDraw(id);
    }

    @PostMapping("/{id}/undo")
    public GameView undo(@PathVariable UUID id) { return service.undo(id); }

    @PostMapping("/{id}/claims")
    public GameView claim(@PathVariable UUID id, @RequestBody DrawClaimRequest request) {
        return service.claimDraw(id, request.claim());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) { service.delete(id); }
}
