/* ObraIA — progresso do aluno no curso.
   Compartilhado por dashboard.html (resumo no quadro do curso) e aulas.html (sala de aula).

   Onde o progresso fica guardado:
   • Banco (tabela aulas_progresso, uma linha por aula concluída) — vale em qualquer aparelho.
   • Navegador (localStorage) — plano B enquanto a tabela não existir ou se a rede falhar.
     O que ficou só no navegador sobe para o banco sozinho na próxima vez que a tabela responder.
   O site funciona igual nos dois modos; só muda onde o "feito" é guardado. */
(function(){
  var TABELA = "aulas_progresso";

  // ── Quem pode ver o curso ────────────────────────────────────────────────
  // Enquanto as aulas não estão prontas, só o dono (ADMIN_ID) enxerga o curso.
  // Para abrir a todos os alunos com licença: troque CURSO_ABERTO para true e publique.
  var CURSO_ABERTO = false;
  var ADMIN_ID = "cb35fabc-f999-43af-980e-28c440adaaa1"; // lucasmsg16@gmail.com
  function podeVerCurso(uid){ return CURSO_ABERTO === true || uid === ADMIN_ID; }

  function chaveLocal(uid){ return "obraia_curso_progresso_" + uid; }
  function lerLocal(uid){
    try{
      var v = JSON.parse(localStorage.getItem(chaveLocal(uid)) || "[]");
      return Array.isArray(v) ? v.filter(function(x){ return typeof x === "string"; }) : [];
    }catch(e){ return []; }
  }
  function gravarLocal(uid, ids){
    try{ localStorage.setItem(chaveLocal(uid), JSON.stringify(ids)); return true; }
    catch(e){ return false; }
  }
  function tabelaAusente(err){
    if(!err) return false;
    var c = err.code || "", m = String(err.message || "").toLowerCase();
    return c === "42P01" || c === "PGRST205" ||
           m.indexOf("does not exist") > -1 || m.indexOf("could not find the table") > -1;
  }
  function ordem(a, b){ return (a.ordem || 0) - (b.ordem || 0); }

  // Aluno vê só módulos ativos e aulas ativas que estejam num módulo ativo (ou sem módulo).
  function filtrarAluno(modulos, aulas){
    var mods = (modulos || []).filter(function(m){ return m.ativo !== false; });
    var ids = {}; mods.forEach(function(m){ ids[m.id] = true; });
    var aul = (aulas || []).filter(function(a){
      return a.ativo !== false && (!a.modulo_id || ids[a.modulo_id]);
    });
    return { modulos: mods, aulas: aul };
  }

  // Ordem global do curso: módulo por módulo, aula por aula; aulas sem módulo vão para o fim.
  function listaOrdenada(modulos, aulas){
    var out = [], usados = {};
    (modulos || []).slice().sort(ordem).forEach(function(m){
      (aulas || []).filter(function(a){ return a.modulo_id === m.id; }).sort(ordem)
        .forEach(function(a){ out.push(a); usados[a.id] = true; });
    });
    (aulas || []).filter(function(a){ return !usados[a.id]; }).sort(ordem)
      .forEach(function(a){ out.push(a); });
    return out;
  }

  function proximaPendente(lista, done){
    for(var i = 0; i < lista.length; i++){ if(!done.has(lista[i].id)) return lista[i]; }
    return null;
  }

  // Lê o que o aluno já concluiu. idsValidos (opcional) descarta aulas que não existem mais.
  async function carregar(sb, uid, idsValidos){
    var validos = idsValidos ? new Set(idsValidos) : null;
    function ok(id){ return !validos || validos.has(id); }
    var local = lerLocal(uid).filter(ok);
    var r;
    try{
      r = await sb.from(TABELA).select("aula_id").eq("user_id", uid);
    }catch(e){ r = { error: e || { message: "falha de rede" } }; }
    if(r.error){
      return { done: new Set(local), modo: "navegador", tabelaAusente: tabelaAusente(r.error) };
    }
    var done = new Set((r.data || []).map(function(x){ return x.aula_id; }).filter(ok));
    var pendentes = local.filter(function(id){ return !done.has(id); });
    if(pendentes.length){
      var s;
      try{
        s = await sb.from(TABELA).insert(pendentes.map(function(id){ return { user_id: uid, aula_id: id }; }));
      }catch(e){ s = { error: e || { message: "falha de rede" } }; }
      if(!s.error){ pendentes.forEach(function(id){ done.add(id); }); gravarLocal(uid, []); }
      else{ pendentes.forEach(function(id){ done.add(id); }); } // continua só no navegador; tenta de novo na próxima
    }else if(local.length){
      gravarLocal(uid, []); // tudo o que estava no navegador já está no banco
    }
    return { done: done, modo: "banco" };
  }

  // Marca/desmarca uma aula. `estado` é o objeto devolvido por carregar() e é atualizado na hora (otimista).
  async function marcar(sb, uid, aulaId, concluida, estado){
    var antes = estado.done.has(aulaId);
    if(concluida) estado.done.add(aulaId); else estado.done.delete(aulaId);

    if(estado.modo === "navegador"){
      var l = lerLocal(uid).filter(function(id){ return id !== aulaId; });
      if(concluida) l.push(aulaId);
      return { ok: gravarLocal(uid, l), modo: "navegador" };
    }

    var err = null;
    try{
      if(concluida){
        var r = await sb.from(TABELA).insert({ user_id: uid, aula_id: aulaId });
        if(r.error && r.error.code !== "23505") err = r.error; // 23505 = já estava marcada: tudo certo
      }else{
        var d = await sb.from(TABELA).delete().eq("user_id", uid).eq("aula_id", aulaId);
        if(d.error) err = d.error;
      }
    }catch(e){ err = e || { message: "falha de rede" }; }
    if(!err) return { ok: true, modo: "banco" };

    if(tabelaAusente(err)) estado.modo = "navegador";
    if(concluida){
      // Não perde o clique: guarda no navegador e sobe depois.
      var l2 = lerLocal(uid).filter(function(id){ return id !== aulaId; }); l2.push(aulaId);
      return { ok: false, modo: estado.modo, guardadoNoNavegador: gravarLocal(uid, l2) };
    }
    // Falhou ao desmarcar no banco: volta ao estado anterior para a tela não mentir.
    if(antes) estado.done.add(aulaId);
    return { ok: false, modo: estado.modo, revertido: true };
  }

  // Resumo para o quadro do curso no painel inicial.
  async function resumo(sb, uid){
    var rm = await sb.from("modulos").select("*").eq("ativo", true).order("ordem", { ascending: true });
    var ra = await sb.from("aulas").select("*").eq("ativo", true).order("ordem", { ascending: true });
    if(rm.error || ra.error) throw (rm.error || ra.error);
    var f = filtrarAluno(rm.data, ra.data);
    var lista = listaOrdenada(f.modulos, f.aulas);
    var est = await carregar(sb, uid, lista.map(function(a){ return a.id; }));
    var feitas = lista.filter(function(a){ return est.done.has(a.id); }).length;
    var prox = proximaPendente(lista, est.done);
    return {
      total: lista.length, feitas: feitas,
      pct: lista.length ? Math.round(feitas * 100 / lista.length) : 0,
      proxima: prox, indiceProxima: prox ? lista.indexOf(prox) + 1 : 0,
      modulos: f.modulos.length, modo: est.modo
    };
  }

  window.ObraCurso = {
    podeVerCurso: podeVerCurso, cursoAberto: function(){ return CURSO_ABERTO === true; },
    filtrarAluno: filtrarAluno, listaOrdenada: listaOrdenada, proximaPendente: proximaPendente,
    carregar: carregar, marcar: marcar, resumo: resumo
  };
})();
