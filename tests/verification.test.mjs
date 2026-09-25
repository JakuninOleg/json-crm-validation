import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVerificationReport } from "../lib/verification.ts";
import { scoreLead } from "../lib/scoring.ts";

const lead = {
  lead_id: 48291,
  name: "Wale O-Michael",
  job_title: "Founder / CEO",
  company_name: "On-Line Dynamics Limited",
  company_address: "7 Adepate Abebi Crescent, Jericho Road, Ibadan, Nigeria",
  country: "Nigeria",
  city: "Ibadan",
  experience: "We help candidates with visa processing, skilled migration and international education.",
  candidate_base: "500+ candidates",
  interested_in: "Sending candidates to Europe",
};

function check(report, claimId) {
  return report.checks.find((item) => item.claim_id === claimId);
}

test("Недоступная страница не подтверждает основателя и CEO", () => {
  const evidence = [{
    claim_id: "founder", verdict: "supports_current", source_id: "s1",
    quote: "Wale O-Michael is Founder of On-Line Dynamics Limited.",
  }];
  const report = buildVerificationReport(lead, [], ["https://apvcon.org/about-us/"], evidence);
  assert.equal(report.status, "insufficient_evidence");
  assert.equal(check(report, "founder").status, "no_public_confirmation");
  assert.equal(check(report, "ceo").status, "no_public_confirmation");
  assert.deepEqual(report.sources, []);
});

test("Цитата должна буквально присутствовать на доступной странице и называть нужного человека", () => {
  const quote = "Wale O-Michael is CEO of On-Line Dynamics Limited.";
  const sources = [{ id: "s1", url: "https://company.example/about", text: quote }];
  const evidence = [
    { claim_id: "ceo", verdict: "supports_current", source_id: "wrong", quote },
    { claim_id: "ceo", verdict: "supports_current", source_id: "s1", quote: "Wale O-Michael founded On-Line Dynamics Limited." },
    { claim_id: "ceo", verdict: "supports_current", source_id: "s1", quote: "Another Person is CEO of On-Line Dynamics Limited." },
  ];
  assert.equal(check(buildVerificationReport(lead, sources, [], evidence), "ceo").status, "no_public_confirmation");
  assert.equal(check(buildVerificationReport(lead, sources, [], [{ claim_id: "ceo", verdict: "supports_current", source_id: "s1", quote }]), "ceo").status, "source_claim");
});

test("Цитата с изменённой пунктуацией не принимается как дословная", () => {
  const source = { id: "s1", url: "https://company.example/about", text: "On-Line Dynamics Limited operates in Ibadan, Nigeria." };
  const evidence = [{ claim_id: "company", verdict: "supports_current", source_id: "s1", quote: "On-Line Dynamics Limited operates in Ibadan: Nigeria." }];
  assert.equal(check(buildVerificationReport(lead, [source], [], evidence), "company").status, "no_public_confirmation");
});

test("Сокращённое или изменённое имя не считается точным совпадением человека", () => {
  const quote = "WALE OYINLOLA-MICHAEL is CEO at ON-LINE DYNAMICS LIMITED.";
  const sources = [{ id: "s1", url: "https://company.example/team", text: quote }];
  const evidence = [{ claim_id: "ceo", verdict: "supports_current", source_id: "s1", quote }];
  assert.equal(check(buildVerificationReport(lead, sources, [], evidence), "ceo").status, "no_public_confirmation");
});

test("Похожее название Online Dynamics не считается компанией On-Line Dynamics Limited", () => {
  const quote = "Online Dynamics is located at Adepate Abebi Crescent in Ibadan.";
  const source = { id: "s1", url: "https://directory.example/ibadan", text: quote };
  const evidence = [{ claim_id: "city", verdict: "supports_current", source_id: "s1", quote }];
  assert.equal(check(buildVerificationReport(lead, [source], [], evidence), "city").status, "no_public_confirmation");
});

test("Адрес из каталога с другим сайтом не добавляет баллы к профилю визовой компании", () => {
  const profile = "On-line Dynamics Ltd is a full-service travel agency that provides visa processing solution across Nigeria.";
  const directory = "ON-LINE DYNAMICS LTD is at 7 Adepate Abebi Crescent, Jericho Road, Ibadan, Nigeria.";
  const sources = [
    { id: "s1", url: "https://ng.linkedin.com/company/online-dynamics", text: `${profile} Website http://traveldynamix.com.ng` },
    { id: "s2", url: "https://directory.example/on-line-dynamics", text: `${directory} Engineering Consulting Firms Website http://onlinedynamicsltd.com` },
  ];
  const evidence = [
    { claim_id: "company", verdict: "supports_current", source_id: "s1", quote: profile },
    { claim_id: "activity", verdict: "supports_current", source_id: "s1", quote: profile },
    { claim_id: "city", verdict: "supports_current", source_id: "s2", quote: directory },
    { claim_id: "address", verdict: "supports_current", source_id: "s2", quote: directory },
  ];
  const report = buildVerificationReport(lead, sources, [], evidence);
  assert.equal(check(report, "city").status, "identity_ambiguous");
  assert.equal(check(report, "address").status, "identity_ambiguous");
  assert.match(check(report, "city").detail, /разные сайты/);
  assert.match(check(report, "city").detail, /разные направления бизнеса/);
  assert.deepEqual(report.sources, [sources[0].url]);
  assert.equal(scoreLead(report).score, 18);
  assert.equal(scoreLead(report).verification_confidence, 19);
});

test("Противоречие из каталога без связи с профилем не обнуляет баллы", () => {
  const travel = "On-line Dynamics Ltd is a full-service travel agency that provides visa processing solution across Nigeria.";
  const engineering = "ON-LINE DYNAMICS LTD is an engineering consulting firm in Ibadan.";
  const sources = [
    { id: "s1", url: "https://profile.example/travel", text: `${travel} Website https://traveldynamix.com.ng` },
    { id: "s2", url: "https://directory.example/engineering", text: `${engineering} Website https://onlinedynamicsltd.com` },
  ];
  const evidence = [
    { claim_id: "company", verdict: "supports_current", source_id: "s1", quote: travel },
    { claim_id: "activity", verdict: "supports_current", source_id: "s1", quote: travel },
    { claim_id: "activity", verdict: "contradicts", source_id: "s2", quote: engineering },
  ];
  const report = buildVerificationReport(lead, sources, [], evidence);
  assert.equal(check(report, "activity").status, "partial_support");
  assert.equal(report.source_discrepancies.length, 1);
  assert.equal(report.source_discrepancies[0].url, sources[1].url);
  assert.deepEqual(report.sources, [sources[0].url]);
  assert.equal(scoreLead(report).score, 18);
});

test("Противоречие с общим сайтом остаётся конфликтом", () => {
  const travel = "On-line Dynamics Ltd is a full-service travel agency that provides visa processing solution across Nigeria.";
  const engineering = "On-line Dynamics Ltd only provides engineering consulting services.";
  const sources = [
    { id: "s1", url: "https://profile.example/travel", text: `${travel} Website https://company.example` },
    { id: "s2", url: "https://directory.example/engineering", text: `${engineering} Website https://company.example` },
  ];
  const evidence = [
    { claim_id: "company", verdict: "supports_current", source_id: "s1", quote: travel },
    { claim_id: "activity", verdict: "supports_current", source_id: "s1", quote: travel },
    { claim_id: "activity", verdict: "contradicts", source_id: "s2", quote: engineering },
  ];
  const report = buildVerificationReport(lead, sources, [], evidence);
  assert.equal(check(report, "activity").status, "conflict");
  assert.equal(report.source_discrepancies.length, 0);
});

test("Разные карточки одного каталога не считаются одной компанией", () => {
  const travel = "On-line Dynamics Ltd provides visa processing services.";
  const engineering = "On-line Dynamics Ltd only provides engineering consulting services.";
  const sources = [
    { id: "s1", url: "https://www.goafricaonline.com/ng/travel", text: `${travel} Website https://travel.example` },
    { id: "s2", url: "https://www.goafricaonline.com/ng/engineering", text: `${engineering} Website https://engineering.example` },
  ];
  const evidence = [
    { claim_id: "activity", verdict: "supports_current", source_id: "s1", quote: travel },
    { claim_id: "activity", verdict: "contradicts", source_id: "s2", quote: engineering },
  ];
  const report = buildVerificationReport(lead, sources, [], evidence);
  assert.equal(check(report, "activity").status, "partial_support");
  assert.equal(report.source_discrepancies.length, 1);
});

test("Город на той же странице, что и профиль бизнеса, принимается", () => {
  const activity = "On-line Dynamics Ltd provides visa processing solutions across Nigeria.";
  const location = "On-line Dynamics Ltd is based in Ibadan, Nigeria.";
  const source = { id: "s1", url: "https://company.example/about", text: `${activity} ${location}` };
  const evidence = [
    { claim_id: "activity", verdict: "supports_current", source_id: "s1", quote: activity },
    { claim_id: "city", verdict: "supports_current", source_id: "s1", quote: location },
  ];
  assert.equal(check(buildVerificationReport(lead, [source], [], evidence), "city").status, "source_claim");
});

test("Проверенная цитата о деятельности подтверждает и название компании", () => {
  const quote = "On-line Dynamics Ltd provides visa processing solutions across Nigeria.";
  const source = { id: "s1", url: "https://company.example/about", text: quote };
  const evidence = [{ claim_id: "activity", verdict: "supports_current", source_id: "s1", quote }];
  const report = buildVerificationReport(lead, [source], [], evidence);
  assert.equal(check(report, "company").status, "source_claim");
  assert.equal(check(report, "activity").status, "partial_support");
  assert.equal(scoreLead(report).score, 18);
});

test("Цитата об инженерных услугах не подтверждает заявленную визовую деятельность", () => {
  const quote = "On-line Dynamics Ltd provides only engineering consulting services.";
  const source = { id: "s1", url: "https://directory.example/company", text: quote };
  const evidence = [{ claim_id: "activity", verdict: "supports_current", source_id: "s1", quote }];
  const report = buildVerificationReport(lead, [source], [], evidence);
  assert.equal(check(report, "activity").status, "no_public_confirmation");
  assert.equal(check(report, "company").status, "no_public_confirmation");
});

test("Общий сайт связывает запись каталога с профилем компании", () => {
  const activity = "On-line Dynamics Ltd provides visa processing solutions across Nigeria.";
  const location = "On-line Dynamics Ltd is based in Ibadan, Nigeria.";
  const sources = [
    { id: "s1", url: "https://profile.example/company", text: `${activity} Website https://travel.example` },
    { id: "s2", url: "https://directory.example/company", text: `${location} Website https://travel.example` },
  ];
  const evidence = [
    { claim_id: "activity", verdict: "supports_current", source_id: "s1", quote: activity },
    { claim_id: "city", verdict: "supports_current", source_id: "s2", quote: location },
  ];
  assert.equal(check(buildVerificationReport(lead, sources, [], evidence), "city").status, "source_claim");
});

test("Одна подтверждённая услуга не подтверждает весь заявленный список", () => {
  const quote = "On-line Dynamics Ltd provides visa processing solutions across Nigeria.";
  const sources = [{ id: "s1", url: "https://company.example/about", text: quote }];
  const evidence = [{ claim_id: "activity", verdict: "supports_current", source_id: "s1", quote }];
  assert.equal(check(buildVerificationReport(lead, sources, [], evidence), "activity").status, "partial_support");
});

test("Архивная копия не подтверждает текущую должность", () => {
  const quote = "Wale O-Michael is CEO of On-Line Dynamics Limited.";
  const sources = [{ id: "s1", url: "https://web.archive.org/web/20200101/https://company.example/about", text: quote }];
  const evidence = [{ claim_id: "ceo", verdict: "supports_current", source_id: "s1", quote }];
  const report = buildVerificationReport(lead, sources, [], evidence);
  assert.equal(check(report, "ceo").status, "historical");
  assert.equal(report.status, "insufficient_evidence");
});

test("Сообщение на форуме не становится прямым доказательством против заявки", () => {
  const quote = "On-Line Dynamics Limited only provides engineering consulting services.";
  const sources = [{ id: "s1", url: "https://www.nairaland.com/123456/topic", text: quote }];
  const evidence = [{ claim_id: "activity", verdict: "contradicts", source_id: "s1", quote }];
  assert.equal(check(buildVerificationReport(lead, sources, [], evidence), "activity").status, "no_public_confirmation");
});

test("Историческое упоминание не подтверждает текущую роль", () => {
  const quote = "Wale O-Michael founded On-Line Dynamics Limited in 2011.";
  const sources = [{ id: "s1", url: "https://company.example/history", text: quote }];
  const evidence = [{ claim_id: "founder", verdict: "historical", source_id: "s1", quote }];
  assert.equal(check(buildVerificationReport(lead, sources, [], evidence), "founder").status, "historical");
});

test("Противоречащие прямые цитаты требуют проверки человеком", () => {
  const current = "Wale O-Michael is CEO of On-Line Dynamics Limited.";
  const contrary = "Wale O-Michael is no longer CEO of On-Line Dynamics Limited.";
  const sources = [
    { id: "s1", url: "https://company.example/about", text: current },
    { id: "s2", url: "https://company.example/news", text: contrary },
  ];
  const evidence = [
    { claim_id: "ceo", verdict: "supports_current", source_id: "s1", quote: current },
    { claim_id: "ceo", verdict: "contradicts", source_id: "s2", quote: contrary },
  ];
  const report = buildVerificationReport(lead, sources, [], evidence);
  assert.equal(check(report, "ceo").status, "conflict");
  assert.deepEqual(report.sources, ["https://company.example/about", "https://company.example/news"]);
});
