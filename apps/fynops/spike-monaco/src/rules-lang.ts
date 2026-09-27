import type * as Monaco from "monaco-editor";

/** A tiny pricing-rules DSL: `when <cond> then <field> <op> <value>`. */
export const RULES_LANGUAGE_ID = "fynops-rules";

export const rulesLanguage: Monaco.languages.IMonarchLanguage = {
  keywords: ["when", "then", "and", "or", "not"],
  fields: ["lane", "weight", "carrier", "rate", "origin", "destination", "priority"],
  operators: ["=", "!=", ">", "<", ">=", "<=", "*=", "+=", "-="],
  symbols: /[=><!*+\-]+/,
  tokenizer: {
    root: [
      [/#.*$/, "comment"],
      [
        /[a-z_]+/,
        { cases: { "@keywords": "keyword", "@fields": "variable", "@default": "identifier" } },
      ],
      [/"[^"]*"/, "string"],
      [/\d+(\.\d+)?/, "number"],
      [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],
    ],
  },
};

export const SAMPLE_RULES = `# FynOps pricing rules
when lane = "CHI-DAL" and weight > 5000 then rate *= 1.1
when carrier = "ACME" or priority = "expedite" then rate += 250
when origin = "LAX" and not destination = "SEA" then rate -= 40
`;
