import {generate} from "pegjs"
import { readFileSync } from "fs";
import * as t from "io-ts";
import { ValueIO, MultiplicativeOperatorIOs, AdditiveOperatorIOs, NumericalComparisonOperatorIOs, EquivalenceComparisonOperatorIOs, Value, String, Variable, StringIO, VariableIO } from "../core";
import { ToUnion, recursiveUnion, asConstMixed } from "../util";
import { isRight } from "fp-ts/lib/Either";

type InfixExpression<T extends string,I extends string,L> = {
    type:T,
    infix: I,
    left:L,
    right:InfixExpression<T,I,L> | L
}

export const toInfixExpressionIO = <
    T extends string,
    I extends [t.Mixed,t.Mixed,...t.Mixed[]],
    L extends t.Mixed,
>(type:T,infixes:I,left:() => L) :t.Type< {
    left:t.TypeOf<L>,
    type: T,
    right:t.TypeOf<L> | InfixExpression<T,ToUnion<I>,t.TypeOf<L>>,
    infix:t.TypeOf<t.UnionC<I>>
}> => {
    const io : t.Type< {
        left:t.TypeOf<L>,
        type: T,
        right:t.TypeOf<L> | InfixExpression<T,ToUnion<I>,t.TypeOf<L>>,
        infix:t.TypeOf<t.UnionC<I>>
    }> = t.recursion(type,() => t.type({
            type:t.literal(type),
            infix:t.union(infixes),
            left:left(),
            right:t.union([left(),io])
        })
    )
    return io
}

interface Grouping {
    type:"Grouping",
    content:UnfinalizedExpression
}
const GroupingIO : t.Type<Grouping> = t.recursion("Grouping", () => t.type({
    type:t.literal("Grouping"),
    content:UnfinalizedExpressionIO
}))

export interface UnfinalizedEmbeddableString{
    type:"EmbeddableString",
    left: String,
    value: Variable,
    right: String | UnfinalizedEmbeddableString
}

const EmbeddableStringIO : t.Type<UnfinalizedEmbeddableString> = t.recursion("EmbeddableString",() => t.type({
    type:t.literal("EmbeddableString"),
    left:StringIO,
    value: VariableIO,
    right: t.union([StringIO,EmbeddableStringIO])
}))

const UnfinalizedValueIO = recursiveUnion(() => [ValueIO,EmbeddableStringIO,GroupingIO])

const MultiplicativeExpressionIO = toInfixExpressionIO(
    "MultiplicativeExpression",
    MultiplicativeOperatorIOs,
    () => UnfinalizedValueIO
)

export type UnfinalizedMultiplicativeExpression = t.TypeOf<typeof MultiplicativeExpressionIO>
const AddableIO  = recursiveUnion(() => [UnfinalizedValueIO,MultiplicativeExpressionIO])

const AdditiveExpressionIO = toInfixExpressionIO(
    "AdditiveExpression",
    AdditiveOperatorIOs,
    () => AddableIO
)

export type UnfinalizedAdditiveExpression = t.TypeOf<typeof AdditiveExpressionIO>

const NumericalComparableIO = recursiveUnion(() => [AdditiveExpressionIO,AddableIO])
const  NumericalComparisonExpressionIO = toInfixExpressionIO(
    "NumericalComparisonExpression",
    NumericalComparisonOperatorIOs,
    () => NumericalComparableIO
)
export type UnfinalizedNumericalComparisonExpression = t.TypeOf<typeof NumericalComparisonExpressionIO>
const EquivalenceComparableIO = recursiveUnion(() => [NumericalComparableIO,NumericalComparisonExpressionIO])

const EquivalenceComparisonExpressionIO = toInfixExpressionIO(
    "EquivalenceComparisonExpression",
    EquivalenceComparisonOperatorIOs,
    () => EquivalenceComparableIO
)

export type UnfinalizedEquivalenceComparisonExpression = t.TypeOf<typeof EquivalenceComparisonExpressionIO>
const UnfinalizedExpressionIO = recursiveUnion(() => [EquivalenceComparableIO,EquivalenceComparisonExpressionIO])

export type UnfinalizedExpression =t.TypeOf<typeof UnfinalizedExpressionIO>
const parser = generate(readFileSync(__dirname + "/mel.pegjs").toString())
export const parse = (text:string) => {
    const parsed = parser.parse(text)
    const decoded = UnfinalizedExpressionIO.decode(parsed)
    if(isRight(decoded)) return decoded.right
    throw new Error([
        "[IO Type Error] The following values have incorrect types.",
        decoded.left.map(e => "- " +JSON.stringify(e.value)) 
    ].join("\n"))
}


