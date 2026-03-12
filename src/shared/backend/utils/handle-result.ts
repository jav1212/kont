export function handleResult(result: any, successStatus: number = 200) {
    if (result.isFailure) {
        return Response.json({ error: result.getError() }, { status: 400 });
    }
    return Response.json({ data: result.getValue() }, { status: successStatus });
}
