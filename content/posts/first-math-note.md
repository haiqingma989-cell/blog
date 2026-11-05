---
title: "A short note on expectation"
slug: "first-math-note"
date: "2026-11-05"
category: "Learning"
tags: ["Math", "LaTeX", "Example"]
description: "A small worked example of expectation, with vectors and a gradient check."
featured: false
cover: "math"
---

> **Example.** A few calculations for practicing mathematical notation.

## Define the outcome

Suppose a trial succeeds with probability $p$, where $0\le p\le 1$. Let the score $X$ follow this rule:

$$
X=
\begin{cases}
10, & \text{on success},\\
2, & \text{otherwise}.
\end{cases}
$$

The scores are chosen for this example. Expectation weights each outcome by its probability:

$$
\mathbb{E}[X]
=10p+2(1-p)
=2+8p.
$$

At $p=0.6$, the expected score is $6.8$. A single trial still scores either $10$ or $2$; the expectation describes an average, not another possible outcome.

Repeating independent trials with the same probability gives the expectation a practical interpretation: their average approaches this value as the number of trials grows.

Check the boundaries: $p=0$ gives $2$, and $p=1$ gives $10$. At $p=0.5$, the two outcomes are equally likely, so their average is $6$. These checks help catch a reversed probability.

## Keep two coordinates together

Column vectors group quantities that change together. Add matching coordinates:

$$
\mathbf{s}
=\begin{bmatrix}10\\20\end{bmatrix},
\qquad
\Delta\mathbf{s}
=\begin{bmatrix}2\\4\end{bmatrix},
\qquad
\mathbf{s}'=\mathbf{s}+\Delta\mathbf{s}
=\begin{bmatrix}12\\24\end{bmatrix}.
$$

The notation is compact, but each row still needs a meaning. Check that the dimensions agree before adding vectors.

## Check one gradient step

For a separate example, take $L(a,b)=(a-1)^2+(b-2)^2$. Differentiating each coordinate gives:

$$
\nabla L(a,b)
=\begin{bmatrix}
2(a-1)\\
2(b-2)
\end{bmatrix}.
$$

At $(0,0)$, the gradient is $(-2,-4)$. A step of size $\eta=0.1$ in the negative gradient direction reaches $(0.2,0.4)$. Substitution shows that $L$ falls from $5$ to $3.2$.

For this quadratic, a small step reduces the error. A larger step can overshoot, so the calculation above checks this update rather than every possible step size.

Both squares are nonnegative, so this function reaches its minimum of zero at $(1,2)$. That conclusion follows from this particular function; a zero gradient does not guarantee a minimum in general.
