/**
 * Cloudflare Pages Function /api/extract (implantação via Git ou Wrangler).
 * Configurar secrets OPENAI_API_KEY e SCHEDULE_UPLOAD_TOKEN no Cloudflare.
 * Opcional: OPENAI_MODEL, default gpt-4.1-mini.
 * Requer token enviado pelo usuário, nunca expõe a chave OpenAI no HTML.
 */
const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
const schema={type:"object",properties:{items:{type:"array",items:{type:"object",properties:{date:{type:"string"},name:{type:"string"},id:{type:"string"},item:{type:"string"},start:{type:"string"},end:{type:"string"},note:{type:"string"}},required:["date","name","id","item","start","end","note"],additionalProperties:false}}},required:["items"],additionalProperties:false};
export async function onRequestPost({request,env}){
  if(!env.OPENAI_API_KEY||!env.SCHEDULE_UPLOAD_TOKEN)return json({error:"IA não configurada neste servidor."},503);
  const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token||token!==env.SCHEDULE_UPLOAD_TOKEN)return json({error:"Token da leitura IA incorreto ou ausente."},401);
  const size=Number(request.headers.get("Content-Length")||0);
  if(size>7_000_000)return json({error:"Foto muito grande (máximo 7 MB por foto)."},413);
  let body;try{body=await request.json()}catch(_){return json({error:"JSON inválido."},400)}
  const image=body?.image,dateHint=String(body?.dateHint||"").slice(0,10);
  if(typeof image!=="string"||image.length>7_000_000||!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(image))return json({error:"Imagem inválida. Use JPEG, PNG ou WebP."},400);
  const instructions=`Você lê fotografias de escala de trabalho de equipes de restaurante/navio. Responda em JSON conforme o schema. Extraia uma linha por turno de trabalho, seção ou pausa claramente legível, com nome completo, ID se visível, atividade/posto, horário início HH:MM, horário fim HH:MM, nota se necessário. Extraia a data impressa na escala para cada linha, no formato DD/MM/AAAA. Se a data não aparecer ou for ilegível, use string vazia; JAMAIS atribua data atual ou invente números. Se vários dias aparecem, dê a data correta a cada linha. Se início ou fim ilegível use string vazia. Não crie linhas a partir de cabeçalhos. Mantenha termos originais e não adivinhe conteúdo ilegível. ${dateHint?`O usuário forneceu a data de referência ${dateHint}; aplique apenas como fallback quando a imagem não mostrar data.`:""}`;
  let upstream;
  try{
    upstream=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-4.1-mini",store:false,max_output_tokens:6000,instructions,
        input:[{role:"user",content:[{type:"input_text",text:"Extraia os horários e datas desta escala, sem inventar nada."},{type:"input_image",image_url:image,detail:"high"}]}],
        text:{format:{type:"json_schema",name:"escala",strict:true,schema}}})
    });
  }catch(_){return json({error:"Serviço de IA inacessível."},502)}
  if(!upstream.ok){const detail=await upstream.text();console.error("OpenAI API failed",upstream.status,detail.slice(0,500));return json({error:"Falha na leitura IA. Confira o modelo, saldo da API e configuração do servidor."},502)}
  let response;try{response=await upstream.json()}catch(_){return json({error:"Resposta do modelo inválida."},502)}
  const output=(response.output||[]).flatMap(x=>(x.content||[]).filter(y=>y.type==="output_text").map(y=>y.text)).join("");
  if(!output)return json({error:"A IA não retornou texto. Confira a imagem."},502);
  try{const result=JSON.parse(output);if(!Array.isArray(result.items))throw new Error("Formato errado");return json({items:result.items})}
  catch(_){return json({error:"Resposta da IA fora do formato esperado."},502)}
}
export function onRequestGet(){return json({error:"Use POST."},405)}
