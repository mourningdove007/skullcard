use ff::Field;
use halo2_poseidon::poseidon::{
    primitives::ConstantLength,
    Hash, Pow5Chip, Pow5Config,
};
use halo2_proofs::{
    circuit::{AssignedCell, Layouter, SimpleFloorPlanner, Value},
    plonk::{self, Circuit, Column, ConstraintSystem, Error, Expression, Instance},
    poly::Rotation,
};
use halo2curves::bn256::Fr as Fp;

use crate::poseidon_bn256::PoseidonBn256Spec;

pub const N: usize = 52;
pub const N_LEAVES: usize = 64;
pub const TREE_DEPTH: usize = 6;

#[derive(Clone, Debug)]
pub struct DeckConfig {
    pub(crate) w_fixed: plonk::Column<plonk::Advice>,
    pub(crate) v_col: plonk::Column<plonk::Fixed>,
    pub(crate) card_col: Vec<plonk::Column<plonk::Advice>>,
    pub(crate) eq_col: Vec<plonk::Column<plonk::Advice>>,
    pub(crate) sum_col: plonk::Column<plonk::Advice>,
    pub(crate) q_enable: plonk::Selector,
    pub(crate) poseidon: Pow5Config<Fp, 3, 2>,
    pub(crate) input_a: plonk::Column<plonk::Advice>,
    pub(crate) input_b: plonk::Column<plonk::Advice>,
    pub(crate) instance: Column<Instance>,
}

pub struct DeckCircuit {
    pub cards: [u64; N],
    pub salts: [Fp; N],
}

impl Circuit<Fp> for DeckCircuit {
    type Config = DeckConfig;
    type FloorPlanner = SimpleFloorPlanner;

    fn without_witnesses(&self) -> Self {
        DeckCircuit { cards: [0u64; N], salts: [Fp::ZERO; N] }
    }

    fn configure(meta: &mut ConstraintSystem<Fp>) -> Self::Config {
        let w_fixed = meta.advice_column();
        meta.enable_equality(w_fixed);

        let v_col = meta.fixed_column();

        let card_col: Vec<plonk::Column<plonk::Advice>> = (0..N)
            .map(|_| {
                let col = meta.advice_column();
                meta.enable_equality(col);
                col
            })
            .collect();

        let eq_col: Vec<plonk::Column<plonk::Advice>> =
            (0..N).map(|_| meta.advice_column()).collect();

        let sum_col = meta.advice_column();
        let q_enable = meta.selector();

        for j in 0..N {
            let eq_j = eq_col[j];
            let card_j = card_col[j];

            meta.create_gate("eq_boolean", |meta| {
                let q = meta.query_selector(q_enable);
                let eq = meta.query_advice(eq_j, Rotation::cur());
                vec![q * eq.clone() * (Expression::Constant(Fp::ONE) - eq)]
            });

            meta.create_gate("eq_diff_zero", |meta| {
                let q = meta.query_selector(q_enable);
                let v = meta.query_fixed(v_col, Rotation::cur());
                let eq = meta.query_advice(eq_j, Rotation::cur());
                let card = meta.query_advice(card_j, Rotation::cur());
                vec![q * eq * (v - card)]
            });
        }

        meta.create_gate("sum_check", |meta| {
            let q = meta.query_selector(q_enable);
            let sum = meta.query_advice(sum_col, Rotation::cur());
            let mut acc = Expression::Constant(Fp::ZERO);
            for j in 0..N {
                acc = acc + meta.query_advice(eq_col[j], Rotation::cur());
            }
            vec![
                q.clone() * (sum.clone() - acc),
                q * (sum - Expression::Constant(Fp::ONE)),
            ]
        });

        let input_a = meta.advice_column();
        let input_b = meta.advice_column();
        meta.enable_equality(input_a);
        meta.enable_equality(input_b);

        let state = [meta.advice_column(), meta.advice_column(), meta.advice_column()];
        let partial_sbox = meta.advice_column();
        let rc_a = [meta.fixed_column(), meta.fixed_column(), meta.fixed_column()];
        let rc_b = [meta.fixed_column(), meta.fixed_column(), meta.fixed_column()];
        meta.enable_constant(rc_b[0]);

        let poseidon =
            Pow5Chip::configure::<PoseidonBn256Spec>(meta, state, partial_sbox, rc_a, rc_b);

        let instance = meta.instance_column();
        meta.enable_equality(instance);

        DeckConfig { w_fixed, v_col, card_col, eq_col, sum_col, q_enable, poseidon, input_a, input_b, instance }
    }

    fn synthesize(
        &self,
        config: Self::Config,
        mut layouter: impl Layouter<Fp>,
    ) -> Result<(), Error> {
        let cards_f: [Fp; N] = self.cards.map(Fp::from);

        layouter.assign_region(
            || "deck",
            |mut region| {
                let mut w_cells: Vec<AssignedCell<Fp, Fp>> = Vec::with_capacity(N);
                let mut card_cells: Vec<Vec<AssignedCell<Fp, Fp>>> =
                    (0..N).map(|_| Vec::with_capacity(N)).collect();

                for v in 0..N {
                    let vf = Fp::from(v as u64);
                    region.assign_fixed(|| "", config.v_col, v, || Value::known(vf))?;

                    let mut sum_val = Fp::ZERO;
                    for j in 0..N {
                        let card_val = cards_f[j];
                        let eq_val = if vf == card_val {
                            sum_val += Fp::ONE;
                            Fp::ONE
                        } else {
                            Fp::ZERO
                        };
                        let cell = region.assign_advice(
                            || "", config.card_col[j], v, || Value::known(card_val),
                        )?;
                        card_cells[j].push(cell);
                        region.assign_advice(
                            || "", config.eq_col[j], v, || Value::known(eq_val),
                        )?;
                    }

                    let wc = region.assign_advice(
                        || "", config.w_fixed, v, || Value::known(cards_f[v]),
                    )?;
                    w_cells.push(wc);
                    region.assign_advice(|| "", config.sum_col, v, || Value::known(sum_val))?;
                    config.q_enable.enable(&mut region, v)?;
                }

                for j in 0..N {
                    for v in 0..N {
                        region.constrain_equal(card_cells[j][v].cell(), w_cells[j].cell())?;
                    }
                }
                Ok(())
            },
        )?;

        let mut leaves: Vec<AssignedCell<Fp, Fp>> = Vec::with_capacity(N_LEAVES);

        for i in 0..N_LEAVES {
            let (a_val, b_val) = if i < N {
                (Value::known(cards_f[i]), Value::known(self.salts[i]))
            } else {
                (Value::known(Fp::ZERO), Value::known(Fp::ZERO))
            };

            let (cell_a, cell_b) = layouter.assign_region(
                || format!("leaf inputs {i}"),
                |mut region| {
                    let a = region.assign_advice(|| "a", config.input_a, 0, || a_val)?;
                    let b = region.assign_advice(|| "b", config.input_b, 0, || b_val)?;
                    Ok((a, b))
                },
            )?;

            let chip = Pow5Chip::construct(config.poseidon.clone());
            let hasher = Hash::<_, _, PoseidonBn256Spec, ConstantLength<2>, 3, 2>::init(
                chip,
                layouter.namespace(|| format!("leaf init {i}")),
            )?;
            let leaf = hasher.hash(
                layouter.namespace(|| format!("leaf hash {i}")),
                [cell_a, cell_b],
            )?;
            leaves.push(leaf);
        }

        let mut level: Vec<AssignedCell<Fp, Fp>> = leaves;

        for depth in 0..TREE_DEPTH {
            let mut next: Vec<AssignedCell<Fp, Fp>> = Vec::with_capacity(level.len() / 2);
            for (idx, pair) in level.chunks(2).enumerate() {
                let chip = Pow5Chip::construct(config.poseidon.clone());
                let hasher = Hash::<_, _, PoseidonBn256Spec, ConstantLength<2>, 3, 2>::init(
                    chip,
                    layouter.namespace(|| format!("node init d={depth} i={idx}")),
                )?;
                let node = hasher.hash(
                    layouter.namespace(|| format!("node hash d={depth} i={idx}")),
                    [pair[0].clone(), pair[1].clone()],
                )?;
                next.push(node);
            }
            level = next;
        }

        layouter.constrain_instance(level[0].cell(), config.instance, 0)
    }
}
