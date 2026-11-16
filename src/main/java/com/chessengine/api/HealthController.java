package com.chessengine.api;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Lightweight uptime probe, independent of game sessions and AI search. */
@RestController
public class HealthController {
    @GetMapping(value = "/healthz", produces = MediaType.TEXT_PLAIN_VALUE)
    public String health() { return "ok"; }
}
