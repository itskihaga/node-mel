export interface Parser<T> {
    __parse__AllowUnconsumed__(str:string):ParserResultInner<T>,
    parse(str:string):ParserResult<T>
    then<R>(mapper: (result:T) => R):Parser<R>,
    validate(predicate: (result:T) => boolean):Parser<T>
    onParsed(cb:(str:string,parsed:ParserResultInner<T>) => void):Parser<T>,
    not(parser:Parser<unknown>):Parser<T>
}
type Parsers<T> = { [P in keyof T]: Parser<T[P]> };
type ParseResultTypeSuccess = "match" 
type ParseResultTypeFailure = "failure" 
type ParseResultSuccess<T> = {result:ParseResultTypeSuccess,content:T}
type ParseResultSuccessInner<T> = {result:ParseResultTypeSuccess,content:T,unconsumed:string}
type ParseResultFailure = {result:ParseResultTypeFailure}

type ParserResultInner<T> = ParseResultFailure | ParseResultSuccessInner<T>
export type ParserResult<T> = ParseResultFailure | ParseResultSuccess<T>

const createMatcher = <T>(arg:Pick<Parser<T>,"__parse__AllowUnconsumed__">):Parser<T> => {
    return {
        ...arg,
        then(mapper){
            return createMatcher({
                __parse__AllowUnconsumed__(str:string){
                    const res = arg.__parse__AllowUnconsumed__(str)
                    switch (res.result) {
                        case "match":
                            return {
                                result:res.result,
                                unconsumed:res.unconsumed,
                                content:mapper(res.content),
                            }
                        case "failure":
                            return {
                                result:res.result
                            }
                    }
                }
            })
        },
        onParsed(cb){
            return createMatcher({
                __parse__AllowUnconsumed__(str){
                    const res = arg.__parse__AllowUnconsumed__(str)
                    cb(str,res);
                    return res;
                }
            })
        },
        parse(str){
            const res = arg.__parse__AllowUnconsumed__(str);
            if(res.result === "failure"){
                return res
            }
            if(res.unconsumed === ""){
                return {
                    result:res.result,
                    content:res.content,
                }
            }
            return {
                result:"failure"
            }
        },
        validate(predicate){
            return createMatcher({
                __parse__AllowUnconsumed__(str:string){
                    const res = arg.__parse__AllowUnconsumed__(str)
                    switch (res.result) {
                        case "match":
                            return predicate(res.content) ? res : {
                                result:"failure"
                            }
                        case "failure":
                            return {
                                result:"failure"
                            }
                    }
                }
            })
        },
        not(parser){
            return createMatcher({
                __parse__AllowUnconsumed__(str:string){
                    const checked = parser.__parse__AllowUnconsumed__(str);
                    switch (checked.result) {
                        case "match":            
                            return {result:"failure"}
                        case "failure":
                            return arg.__parse__AllowUnconsumed__(str)
                    }
                }
            })
        }
    }
}
export const recur = <T>(factory:() => Parser<T>):Parser<T> => createMatcher({
    __parse__AllowUnconsumed__(str){
        return factory().__parse__AllowUnconsumed__(str);
    }
})

export const sequence = <T extends Array<unknown>>(...parsers:Parsers<T>): Parser<T> => {
    return createMatcher({
        __parse__AllowUnconsumed__(str){
            return _matchSeq(str,parsers) as ParserResultInner<T>
        }
    })
}

const _matchSeq = <T>(str:string,parsers:Parser<T>[]):ParserResultInner<T[]> => {
    const fn = (cur:string,num:number = 0,prev:T[]=[]):ParserResultInner<T[]> => {
        const parser = parsers[num]
        const res = parser.__parse__AllowUnconsumed__(cur)
        switch (res.result) {
            case "match":
                const content = [...prev,res.content]
                return parsers[num + 1] ? 
                    fn(res.unconsumed,num + 1,content) : 
                    {result:"match",content,unconsumed:res.unconsumed}
            case "failure":
                return {result:"failure"}
        }
    }
    return fn(str);
}

export const choice = <T extends Array<unknown>>(...parsers:Parsers<T>) :Parser<T[number]> => {
    return createMatcher({
        __parse__AllowUnconsumed__(str){
            const fn = (num:number = 0):ParserResultInner<T[number]> => {
                const parser = parsers[num]
                if(typeof parser == "undefined") return {result:"failure"};
                const res = parser.__parse__AllowUnconsumed__(str);
                switch (res.result) {
                    case "match":  
                        return res
                    case "failure":
                        return fn(num + 1)
                }
            }
            return fn()
        }
    })
}

export const multi = <T>(parser:Parser<T>) : Parser<T[]> => {
    return createMatcher({
        __parse__AllowUnconsumed__(str){
            const fn = (cur:string=str,acc:T[]=[]):ParserResultInner<T[]> => {
                const res = parser.__parse__AllowUnconsumed__(cur);
                switch (res.result) {
                    case "match":
                        const content = [...acc,res.content]
                        return res.unconsumed !== "" ? 
                            fn(res.unconsumed,content) : 
                            {result:"match",content,unconsumed:res.unconsumed}
                    case "failure":
                        return  {result:"match",content:acc,unconsumed:cur}
                }
            }
            return fn();
        }
    })
}

export const regexp = (exp:string):Parser<string> => {
    const matcher = new RegExp(`^(${exp})(.*)$`)
    return createMatcher({
        __parse__AllowUnconsumed__(str){
            const result = matcher.exec(str);
            if(!result){
                return {result:"failure"}
            }
            const [,content,unconsumed] = result
            return {content:content,result:"match",unconsumed}
        },
    })
}

const escapeRegExp = (text:string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

export const chars = <S extends string>(literal:S):Parser<S> => {
    const escaped = escapeRegExp(literal);
    const matcher = new RegExp(`^(${escaped})(.*)$`)
    return createMatcher({
        __parse__AllowUnconsumed__(str){
            const result = matcher.exec(str);
            if(!result){
                return {result:"failure"}
            }
            const [,,unconsumed] = result
            return {content:literal,result:"match",unconsumed}
        },
    })
}



