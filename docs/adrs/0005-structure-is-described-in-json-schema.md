# ADR 0005: Structure Is Described in JSON Schema

## Date

2026-10-02

## Context

Contract First puts the contract above both sides of a boundary. A structure described in a format invented here, a file layout, a document, or a prose description of a shape, is a contract no tool can check and every reader must learn. JSON Schema is a published standard that validates, documents, and generates from one definition.

## Decision

Every structure is described in JSON Schema, a file layout or a document included, rather than in a format invented here.
