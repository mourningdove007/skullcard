from py_ecc.bn128 import pairing, multiply, add, FQ, FQ2
import json

def parse_g1(point):
    return (FQ(int(point[0])), FQ(int(point[1])))

def parse_g2(point):
    return (
        FQ2([int(point[0][0]), int(point[0][1])]),
        FQ2([int(point[1][0]), int(point[1][1])]),
    )

pi_a = parse_g1([
    "6467772022981148097303029057158910899237752206532949195452408102406940578248",
    "20886361934274636621078668320778326886769363896523215795765227681804111427359"
])

pi_b = parse_g2([
    ["13351152290465567151000789493123891088821006706119582791494468348862228030553",
     "8977877502820913782954323268225410649169633053528076337846122684550117554656"],
    ["1746375146485984947306618674171063249355870252013092902429496233117572901055",
     "7565021288406849665099577231350046144422842629815617442316253274870445136613"],
])

pi_c = parse_g1([
    "844907077185858291450780359287223861405533113039572588648673498649338065165",
    "17897804557178163691735257599958336275998859228994618528274296025642752738230"
])

public_signals = [
    "2365104944340454206097250202502901940622728556308771457953022163328474818711"
]

vk = json.load(open("verification_key.json"))

alpha = parse_g1(vk["vk_alpha_1"])
beta  = parse_g2(vk["vk_beta_2"])
gamma = parse_g2(vk["vk_gamma_2"])
delta = parse_g2(vk["vk_delta_2"])
IC    = [parse_g1(p) for p in vk["IC"]]

vk_x = IC[0]
for i, signal in enumerate(public_signals):
    vk_x = add(vk_x, multiply(IC[i + 1], int(signal)))

lhs = pairing(pi_b, pi_a)

rhs = (pairing(beta,  alpha) *
       pairing(gamma, vk_x)  *
       pairing(delta, pi_c))

print("Proof valid:", lhs == rhs)
