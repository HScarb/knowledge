# Git rebase --onto an overview: Removing commits from a current branch or changing parent branch.

https://womanonrails.com/git-rebase-onto

In article [How to change parent branch in git?](https://womanonrails.com/replace-parent-branch) I talked quickly about using `git rebase --onto` in a case when you want to replace the current parent branch. But `git rebase --onto` is more than just replacing parent branch. We can do much more with `git rebase --onto` help. It’s a good topic to take a look closely. To use it freely first, you need to understand it.

There are two cases when you can go for `git rebase --onto`:

1. You have a branch, where you want to change its parent branch.
2. You want to quickly remove some commits from your current branch.

Of course, you can combine these two reasons. You can change the parent branch and remove some commits at the same time. We will get to this point. But before we go there, we need to understand the differences between `git rebase --onto` with two and three arguments.

Let’s start from the beginning. First, we will focus on just a simple `git rebase`. I wrote a separate article about [git rebase](https://womanonrails.com/git-rebase). So if you want to know more about `git rebase` go there. Right now, we will cover it very quickly.

## Git rebase

`git rebase <newparent> <branch>` is a command which allows us to have access to the latest commit that is reachable from `<newparent>` and move our `<branch>` commits on top of it.

In case we use the command:

```
git rebase master next-feature
```

we will get:

```
Before                            After
A---B---C---F---G (HEAD master)   A---B---C---F---G (master)
         \                                         \
          D---E (next-feature)                      D'---E' (HEAD next-feature)
```

As you see above after `git rebase` our `HEAD` is always the last argument. In our case on branch `next-feature`. So we switch branch to `next-feature`. On this branch, we still get access to our code in commits `D` and `E`, but they are not the same commits. Their unique identifier generated by cryptographic hash function **SHA-1** (`dce79fd`), which we often call just **SHA**, changed. This is why I marked them as `D'` and `E'`.

When we use `git rebase` and we are already on the branch which we want to rebase, we can skip a second argument. We can do:

```
git rebase master
```

and the result will be the same

```
Before                              After
A---B---C---F---G (master)          A---B---C---F---G (master)
         \                                           \
          D---E (HEAD next-feature)                   D'---E' (HEAD next-feature)
```

In both cases on the `master` branch, we had two commits `F` and `G` that are not reachable from the `next-feature` branch. When we do `git rebase` we take `D` commit (which is the first commit on the `next-feature` branch) with all next commits on this branch and we move them on top of the last commit on `master` branch so on top of `G`. In our case, when we look at the diagram, it will be better to say that *we move our commits on the end of the `master` branch*. However, keep in mind that when you use tools like `git log`, you will see changes on top of the `master` branch. In other words, we change the parent of our `next-feature` branch from commit `C` to commit `G` on the `master` branch.

## Git rebase –onto

### More precise changing parent branch

In case of `git rebase --onto` we can change the point where our branch is starting not only to the last commit on parent branch, but we can choose specific commit where we start and also where we finish. This is true not only on one specific branch but for other branches (all valid commits) too. We can say that `git rebase --onto` in precise and elastic solution. It grants you control over what and where is being rebased.

For example, you would like to change the branch starting point from `C` to `F` and you would like to remove commit `D` from your `next-feature` branch. To do that we need to use this command:

```
git rebase --onto F D
```

The effect will look like this:

```
Before                                    After
A---B---C---F---G (branch)                A---B---C---F---G (branch)
         \                                             \
          D---E---H---I (HEAD my-branch)                E'---H'---I' (HEAD my-branch)
```

We rebase the commit reachable from `HEAD` (`my-branch`) where parent commit is `D` on top of the `F` commit. So, we can say that we change the parent of commit `E` from `D` to `F`.

The same effect, we will get when we call:

```
git rebase --onto F D my-branch
```

The situation looks different when instead of `HEAD` as the third argument we will use the last commit. In our case `I`. When we will call:

```
git rebase --onto F D I
```

The effect looks like this:

```
Before                                    After
A---B---C---F---G (branch)                A---B---C---F---G (branch)
         \                                        |    \
          D---E---H---I (HEAD my-branch)          |     E'---H'---I' (HEAD)
                                                   \
                                                    D---E---H---I (my-branch)
```

As in the normal `git rebase` we switch `HEAD` to the last argument of `git rebase --onto` command. In this case, this is a commit `I'`. We see that our branch `my-branch` stayed like it was before. Nothing has changed on the `my-branch`. But we have new *branch* which is our new `HEAD`. Right now it is not the real branch, but we can name it. What happened here? We told git that we change the parent of commit `E`. You can think: *“But, why commit `E`? We don’t have the commit `E` in our command.”* Since the current parent is the commit `D`, then its child is the commit `E`. So we change the parent of commit `E` from `D` to `F`, but we also switch `HEAD` from branch `my-branch` to the new commit `I'`.

The same effect, we will get when we call:

```
git rebase --onto F D HEAD
```

A similar situation is when we want to switch `HEAD` to commit `H`. We will use the command:

```
git rebase --onto F D H
```

Our branches will look like:

```
Before                                    After
A---B---C---F---G (branch)                A---B---C---F---G (branch)
         \                                        |    \
          D---E---H---I (HEAD my-branch)          |     E'---H' (HEAD)
                                                   \
                                                    D---E---H---I (my-branch)
```

The only thing which changed from the last example is that we don’t finish our new `HEAD` on commit `I'`, but on commit `H'`. We are ignoring where `HEAD` was pointing to and we choose one commit before old `HEAD` - commit `H`. Equivalent behavior we will get when we will do these commands:

```
git rebase --onto F D H
git rebase --onto F D HEAD^
git rebase --onto F D HEAD~
git rebase --onto F D HEAD~1
```

### Removing commits from the current branch

This is a nice solution. When you want to quickly remove some commits from your current branch without using interactive rebase. If we have a branch and we want to remove commits `C` and `D`, we can do that by using:

```
git rebase --onto B D
```

This gives us:

```
Before                                 After
A---B---C---D---E---F (HEAD branch)    A---B---E'---F' (HEAD branch)
```

In this example, we say rebase `HEAD` on top of commit `B`, where the old parent branch was a commit `D`. The same effect, we will get for:

```
git rebase --onto B D my-branch
```

If we use `git rebase --onto` with three arguments, where the last one is a commit identifier, the situation will look slightly different. We can say rebase `HEAD` on top of commit `B`, where the old parent branch was a commit `D`, but only to commit `E` and switch `HEAD` there. To achieve that we will use the command:

```
git rebase --onto B D E
```

We will get *new branch* with only commit `E'` with parent commit `B`.

```
Before                                 After
A---B---C---D---E---F (HEAD branch)    A---B---C---D---E---F (branch)
                                            \
                                             E' (HEAD)
```

## Summary git rebase –onto

Let’s summarize how `git rebase --onto` is working. We can call `git rebase --onto` with two or three arguments. When we use two arguments general syntax looks like this:

```
git rebase --onto <newparent> <oldparent>
```

This will allow as to change the current parent `<oldparent>` to new one `<newparent>`. Because we didn’t specify the third argument, we will stay on our current branch. For `git rebase ---onto` with three arguments situation will look different. This is general syntax:

```
git rebase --onto <newparent> <oldparent> <until>
```

Now we can change the old parent `<oldparent>` to new one `<newparent>`, but we will take commits only until `<until>` commit. Remember `<until>` will become the new `HEAD` after rebase is completed.