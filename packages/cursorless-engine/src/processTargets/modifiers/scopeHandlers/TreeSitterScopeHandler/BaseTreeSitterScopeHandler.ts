import {
  Direction,
  Position,
  TextDocument,
  TextEditor,
} from "@cursorless/common";
import { QueryMatch } from "web-tree-sitter";
import { TreeSitterQuery } from "../../../../languages/TreeSitterQuery";
import BaseScopeHandler from "../BaseScopeHandler";
import { compareTargetScopes } from "../compareTargetScopes";
import { TargetScope } from "../scope.types";
import { ScopeIteratorRequirements } from "../scopeHandler.types";

/** Base scope handler to use for both tree-sitter scopes and their iteration scopes */
export abstract class BaseTreeSitterScopeHandler extends BaseScopeHandler {
  constructor(protected query: TreeSitterQuery) {
    super();
  }

  *generateScopeCandidates(
    editor: TextEditor,
    position: Position,
    direction: Direction,
    hints: ScopeIteratorRequirements,
  ): Iterable<TargetScope> {
    const { document } = editor;

    /** Narrow the range within which tree-sitter searches, for performance */
    const { start, end } = getQuerySearchRange(
      document,
      position,
      direction,
      hints,
    );

    yield* this.query
      .matches(document, start, end)
      .map((match) => this.matchToScope(editor, match))
      .filter((scope): scope is TargetScope => scope != null)
      .sort((a, b) => compareTargetScopes(direction, position, a, b));
  }

  /**
   * Convert a tree-sitter match to a scope, or undefined if the match is not
   * relevant to this scope handler
   * @param editor The editor in which the match was found
   * @param match The match to convert to a scope
   * @returns The scope, or undefined if the match is not relevant to this scope
   * handler
   */
  protected abstract matchToScope(
    editor: TextEditor,
    match: QueryMatch,
  ): TargetScope | undefined;
}

/**
 * Constructs a range to pass to {@link Query.matches} to find scopes. Note
 * that {@link Query.matches} will only return scopes that have non-empty
 * intersection with this range.  Also note that the base
 * {@link BaseScopeHandler.generateScopes} will filter out any extra scopes
 * that we yield, so we don't need to be totally precise.
 *
 * @returns Range to pass to {@link Query.matches}
 */
function getQuerySearchRange(
  document: TextDocument,
  position: Position,
  direction: Direction,
  { containment, distalPosition }: ScopeIteratorRequirements,
) {
  const offset = document.offsetAt(position);
  const distalOffset = document.offsetAt(distalPosition);

  if (containment === "required") {
    // If containment is required, we smear the position left and right by one
    // character so that we have a non-empty intersection with any scope that
    // touches position
    return {
      start: document.positionAt(offset - 1),
      end: document.positionAt(offset + 1),
    };
  }

  // If containment is disallowed, we can shift the position forward by a character to avoid
  // matching scopes that touch position.  Otherwise, we shift the position backward by a
  // character to ensure we get scopes that touch position.
  const proximalShift = containment === "disallowed" ? 1 : -1;

  // FIXME: Don't go all the way to end of document when there is no distalPosition?
  // Seems wasteful to query all the way to end of document for something like "next funk"
  // Might be better to start smaller and exponentially grow
  return direction === "forward"
    ? {
        start: document.positionAt(offset + proximalShift),
        end: document.positionAt(distalOffset + 1),
      }
    : {
        start: document.positionAt(distalOffset - 1),
        end: document.positionAt(offset - proximalShift),
      };
}