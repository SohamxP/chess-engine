package com.chessengine.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.chessengine.api")
public class ChessApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(ChessApiApplication.class, args);
    }
}
